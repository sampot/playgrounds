import {
  isAnchorSignalFrame,
  type AnchorSignalFrame,
} from "@pg/roster/boothChannel";
import {
  applyBoothVideoCodecPreferences,
  boothSlotOfIndex,
  ensureBoothTransceiversSendrecv,
  replaceBoothTrack,
} from "@pg/roster/rosterBoothMedia";
import {
  buildRosterRtcConfiguration,
  reserveBoothMediaTransceivers,
} from "@pg/roster/rosterPeer";
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

export function createBoothOperatorRtc(opts: {
  sendSignal: OperatorRtcSend;
  onProgramStream: (stream: MediaStream | null) => void;
  onOwnerChannel?: (dc: RTCDataChannel) => void;
}) {
  let pc: RTCPeerConnection | null = null;
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
    pc = new RTCPeerConnection(buildRosterRtcConfiguration(false));
    programStream = null;
    emitProgram();
    reserveBoothMediaTransceivers(pc);
    applyBoothVideoCodecPreferences(pc);

    const ownerDc = pc.createDataChannel(BOOTH_OWNER_DC_LABEL, { ordered: true });
    ownerDc.onopen = () => opts.onOwnerChannel?.(ownerDc);

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
  };
}

export function createBoothEngineOperatorRtc(opts: {
  sendSignal: OperatorRtcSend;
  getTvStream: () => MediaStream | null;
  onOwnerChannel?: (dc: RTCDataChannel) => void;
}) {
  let pc: RTCPeerConnection | null = null;
  const iceQueue = createOperatorIceQueue(() => pc);

  async function attachProgramTracks(): Promise<void> {
    if (!pc) return;
    const { audio, video } = programTracksFromStream(opts.getTvStream());
    await replaceBoothTrack(pc, "program", "audio", audio);
    await replaceBoothTrack(pc, "program", "video", video);
  }

  async function handleSignal(frame: AnchorSignalFrame): Promise<void> {
    if (!isAnchorSignalFrame(frame)) return;
    if (frame.op === "offer" && frame.sdp) {
      pc?.close();
      iceQueue.clear();
      pc = new RTCPeerConnection(buildRosterRtcConfiguration(false));
      // Offer already negotiated 2+2 transceivers — do not reserve again.
      await pc.setRemoteDescription({ type: "offer", sdp: frame.sdp });
      await iceQueue.flush();
      ensureBoothTransceiversSendrecv(pc);
      applyBoothVideoCodecPreferences(pc);
      await attachProgramTracks();

      pc.ondatachannel = (ev) => {
        if (ev.channel.label === BOOTH_OWNER_DC_LABEL) {
          opts.onOwnerChannel?.(ev.channel);
        }
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

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const sdp = pc.localDescription?.sdp;
      if (!sdp) throw new Error("operator_rtc_answer_missing");
      opts.sendSignal({
        type: "anchor.signal",
        v: 1,
        phase: "operator-webrtc",
        op: "answer",
        sdp,
      });
      return;
    }
    if (frame.op === "candidate" && pc) {
      await iceQueue.add(frame.candidate);
    }
  }

  return {
    handleSignal,
    refreshProgram: () => attachProgramTracks(),
    stop: () => {
      iceQueue.clear();
      try {
        pc?.close();
      } catch {
        /* ignore */
      }
      pc = null;
    },
  };
}
