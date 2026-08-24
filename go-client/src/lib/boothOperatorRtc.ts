import {
  isAnchorSignalFrame,
  type AnchorSignalFrame,
} from "@pg/roster/boothChannel";
import {
  attachRosterDataChannel,
  buildRosterRtcConfiguration,
  reserveBoothMediaTransceivers,
  waitIceComplete,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  applyBoothVideoCodecPreferences,
  boothSlotOfIndex,
  ensureBoothTransceiversSendrecv,
  replaceBoothTrack,
} from "@pg/roster/rosterBoothMedia";
import { BOOTH_OWNER_DC_LABEL } from "./boothOwnerFileWire";

export type OperatorRtcSend = (frame: AnchorSignalFrame) => void;

export function parseOperatorRtcCandidate(
  raw: string | undefined
): RTCIceCandidateInit | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as RTCIceCandidateInit;
    if (typeof parsed.candidate === "string") return parsed;
  } catch {
    /* fall through */
  }
  return { candidate: raw, sdpMid: null, sdpMLineIndex: null };
}

export function serializeOperatorRtcCandidate(
  candidate: RTCIceCandidate | null
): string | undefined {
  if (!candidate) return undefined;
  return JSON.stringify(candidate.toJSON());
}

export function programTracksFromStream(stream: MediaStream | null): {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
} {
  if (!stream) return { audio: null, video: null };
  return {
    audio: stream.getAudioTracks()[0] ?? null,
    video: stream.getVideoTracks()[0] ?? null,
  };
}

function createOperatorIceQueue(getPc: () => RTCPeerConnection | null) {
  const pending: RTCIceCandidateInit[] = [];
  return {
    async add(raw: string | undefined): Promise<void> {
      const init = parseOperatorRtcCandidate(raw);
      if (!init) return;
      const conn = getPc();
      if (!conn?.remoteDescription) {
        pending.push(init);
        return;
      }
      try {
        await conn.addIceCandidate(init);
      } catch {
        /* ignore late/duplicate */
      }
    },
    async flush(): Promise<void> {
      const conn = getPc();
      if (!conn?.remoteDescription) return;
      const batch = pending.splice(0);
      for (const init of batch) {
        try {
          await conn.addIceCandidate(init);
        } catch {
          /* ignore */
        }
      }
    },
    clear(): void {
      pending.length = 0;
    },
  };
}

/** Hub answerer: Operator offer SDP → Roster session + program answer. */
export async function acceptBoothOperatorOffer(opts: {
  sdp: string;
  localPresence: { agentId: string; name: string };
  rosterHandlers: RosterPeerHandlers;
  onOwnerChannel?: (dc: RTCDataChannel) => void;
}): Promise<{ session: RosterPeerSession; answerSdp: string }> {
  let rosterChannel: RTCDataChannel | null = null;
  const pc = new RTCPeerConnection(buildRosterRtcConfiguration(false));

  pc.addEventListener("datachannel", (ev) => {
    const ch = ev.channel;
    if (ch.label === BOOTH_OWNER_DC_LABEL) {
      opts.onOwnerChannel?.(ch);
      return;
    }
    if (ch.label === "roster") {
      rosterChannel = ch;
      attachRosterDataChannel(ch, opts.rosterHandlers, opts.localPresence);
    }
  });

  await pc.setRemoteDescription({ type: "offer", sdp: opts.sdp });
  ensureBoothTransceiversSendrecv(pc);
  applyBoothVideoCodecPreferences(pc);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc);
  const answerSdp = pc.localDescription?.sdp;
  if (!answerSdp) throw new Error("operator_rtc_answer_missing");

  const session: RosterPeerSession = {
    pc,
    getChannel: () => rosterChannel,
    role: "guest",
    close: () => {
      try {
        rosterChannel?.close();
      } catch {
        /* ignore */
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    },
    send: (data: unknown) => {
      const channel = rosterChannel;
      if (!channel || channel.readyState !== "open") {
        throw new Error("DataChannel 尚未開啟");
      }
      channel.send(JSON.stringify(data));
    },
  };

  return { session, answerSdp };
}

export function createBoothOperatorRtc(opts: {
  sendSignal: OperatorRtcSend;
  onProgramStream: (stream: MediaStream | null) => void;
  onOwnerChannel?: (dc: RTCDataChannel) => void;
  rosterHandlers?: RosterPeerHandlers;
  localPresence?: { agentId: string; name: string };
}) {
  let pc: RTCPeerConnection | null = null;
  let rosterChannel: RTCDataChannel | null = null;
  let programStream: MediaStream | null = null;
  let stopped = false;
  const iceQueue = createOperatorIceQueue(() => pc);

  function emitProgram(): void {
    opts.onProgramStream(programStream);
  }

  function bindProgramTrack(track: MediaStreamTrack): void {
    if (!programStream) programStream = new MediaStream();
    const kind = track.kind;
    for (const existing of programStream.getTracks()) {
      if (existing.kind === kind) programStream.removeTrack(existing);
    }
    programStream.addTrack(track);
    emitProgram();
  }

  async function negotiate(): Promise<void> {
    if (stopped || typeof RTCPeerConnection === "undefined") return;
    pc?.close();
    iceQueue.clear();
    rosterChannel = null;
    pc = new RTCPeerConnection(buildRosterRtcConfiguration(false));
    programStream = null;
    emitProgram();
    reserveBoothMediaTransceivers(pc);
    applyBoothVideoCodecPreferences(pc);

    rosterChannel = pc.createDataChannel("roster", { ordered: true });
    attachRosterDataChannel(
      rosterChannel,
      opts.rosterHandlers ?? {},
      opts.localPresence
    );

    const ownerDc = pc.createDataChannel(BOOTH_OWNER_DC_LABEL, { ordered: true });
    const bindOwnerChannel = () => opts.onOwnerChannel?.(ownerDc);
    ownerDc.onopen = bindOwnerChannel;
    if (ownerDc.readyState === "open") bindOwnerChannel();

    pc.ontrack = (ev) => {
      const idx = pc?.getTransceivers().indexOf(ev.transceiver) ?? -1;
      const slot = boothSlotOfIndex(idx);
      if (slot?.layer === "program") bindProgramTrack(ev.track);
    };

    pc.onicecandidate = (ev) => {
      const serialized = serializeOperatorRtcCandidate(ev.candidate);
      if (!serialized) return;
      opts.sendSignal({
        type: "anchor.signal",
        v: 1,
        phase: "operator-webrtc",
        op: "candidate",
        candidate: serialized,
      });
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("operator_rtc_offer_missing");
    opts.sendSignal({
      type: "anchor.signal",
      v: 1,
      phase: "operator-webrtc",
      op: "offer",
      sdp,
    });
  }

  async function handleSignal(frame: AnchorSignalFrame): Promise<void> {
    if (!isAnchorSignalFrame(frame) || !pc) return;
    if (frame.op === "answer" && frame.sdp) {
      await pc.setRemoteDescription({ type: "answer", sdp: frame.sdp });
      await iceQueue.flush();
      return;
    }
    if (frame.op === "candidate") {
      await iceQueue.add(frame.candidate);
    }
  }

  function stop(): void {
    stopped = true;
    rosterChannel = null;
    try {
      pc?.close();
    } catch {
      /* ignore */
    }
    pc = null;
    programStream = null;
    emitProgram();
  }

  return {
    start: () => negotiate(),
    handleSignal,
    stop,
    getProgramStream: () => programStream,
    getPc: () => pc,
    sendRoster: (data: unknown) => {
      if (!rosterChannel || rosterChannel.readyState !== "open") {
        throw new Error("DataChannel 尚未開啟");
      }
      rosterChannel.send(JSON.stringify(data));
    },
    sendRosterBinary: (buf: ArrayBuffer) => {
      if (!rosterChannel || rosterChannel.readyState !== "open") {
        throw new Error("DataChannel 尚未開啟");
      }
      rosterChannel.send(buf);
    },
    rosterBufferedAmount: () => rosterChannel?.bufferedAmount ?? 0,
  };
}

export function createBoothEngineOperatorRtc(opts: {
  sendSignal: OperatorRtcSend;
  getTvStream: () => MediaStream | null;
  onOwnerChannel?: (dc: RTCDataChannel) => void;
  localPresence: { agentId: string; name: string };
  getRosterHandlers: (shellId: string) => RosterPeerHandlers;
  onSession?: (session: RosterPeerSession, shellId: string) => void;
}) {
  let session: RosterPeerSession | null = null;
  let activeShellId: string | null = null;
  const iceQueue = createOperatorIceQueue(() => session?.pc ?? null);

  async function attachProgramTracks(): Promise<void> {
    if (!session) return;
    const { audio, video } = programTracksFromStream(opts.getTvStream());
    await replaceBoothTrack(session.pc, "program", "audio", audio);
    await replaceBoothTrack(session.pc, "program", "video", video);
  }

  async function handleSignal(
    frame: AnchorSignalFrame,
    shellId?: string
  ): Promise<void> {
    if (!isAnchorSignalFrame(frame)) return;
    if (frame.op === "offer" && frame.sdp) {
      const sid = shellId?.trim() || activeShellId || "operator";
      activeShellId = sid;
      session?.close();
      iceQueue.clear();
      const accepted = await acceptBoothOperatorOffer({
        sdp: frame.sdp,
        localPresence: opts.localPresence,
        rosterHandlers: opts.getRosterHandlers(sid),
        onOwnerChannel: opts.onOwnerChannel,
      });
      session = accepted.session;
      opts.onSession?.(session, sid);
      await attachProgramTracks();

      session.pc.onicecandidate = (ev) => {
        const serialized = serializeOperatorRtcCandidate(ev.candidate);
        if (!serialized) return;
        opts.sendSignal({
          type: "anchor.signal",
          v: 1,
          phase: "operator-webrtc",
          op: "candidate",
          candidate: serialized,
        });
      };

      opts.sendSignal({
        type: "anchor.signal",
        v: 1,
        phase: "operator-webrtc",
        op: "answer",
        sdp: accepted.answerSdp,
      });
      return;
    }
    if (frame.op === "candidate" && session) {
      await iceQueue.add(frame.candidate);
    }
  }

  return {
    handleSignal,
    refreshProgram: () => attachProgramTracks(),
    getSession: () => session,
    stop: () => {
      iceQueue.clear();
      session?.close();
      session = null;
      activeShellId = null;
    },
  };
}
