/**
 * Roster WebRTC peer: one non-trickle offer/answer + DataChannel (DEC-045).
 */

import {
  prepareFieldsForExchange,
  type RosterSdpRole,
} from "./rosterSdpCodec";
import {
  ROSTER_WIRE_MAX_CHARS,
  ROSTER_WIRE_MAX_CHARS_SIGNAL,
  encodeFieldsToRosterWire,
  decodeRosterWireToSdp,
} from "./rosterWire";

const DEFAULT_STUN: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

/** Hard cap waiting for ICE gather (Chromium often never reaches `complete`). */
const ICE_GATHER_HARD_MS = 12_000;
/**
 * After the first candidate, wait briefly for srflx／extra hosts then proceed.
 * Non-trickle (DEC-045) needs *some* candidates in the wire — not all of them.
 */
const ICE_GATHER_SETTLE_MS = 2_500;

export type RosterPresenceMsg = {
  type: "presence";
  agentId: string;
  name: string;
};

/** Phase 2.5 DataChannel envelope (not session protocol). */
export type RosterAvatarRelayMsg = {
  type: "avatar_relay";
  from: string;
  to?: string;
  payload: {
    kind: string;
    [key: string]: unknown;
  };
};

export type RosterPeerHandlers = {
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onMessage?: (data: unknown) => void;
  /** Raw DataChannel binary frames (session_file chunks). */
  onBinary?: (data: ArrayBuffer) => void;
  onError?: (err: Error) => void;
};

export type RosterPeerSession = {
  pc: RTCPeerConnection;
  getChannel: () => RTCDataChannel | null;
  role: "host" | "guest";
  close: () => void;
  send: (data: unknown) => void;
};

/** Exported for tests — true when SDP already embeds ICE candidates. */
export function sdpHasIceCandidates(sdp: string | undefined | null): boolean {
  if (!sdp) return false;
  return /(?:^|\r?\n)a=candidate:/m.test(sdp);
}

/**
 * Wait until ICE gather is usable for non-trickle offer／answer.
 * Chromium may never emit gatheringState `complete` (STUN／mDNS hang) — also
 * finish on null `icecandidate`, or soft-timeout once candidates exist.
 */
export function waitIceComplete(
  pc: RTCPeerConnection,
  opts?: { hardMs?: number; settleMs?: number }
): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  const hardMs = opts?.hardMs ?? ICE_GATHER_HARD_MS;
  const settleMs = opts?.settleMs ?? ICE_GATHER_SETTLE_MS;

  return new Promise((resolve, reject) => {
    let settled = false;
    let sawCandidate = false;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      clearTimeout(hardTimer);
      if (settleTimer) clearTimeout(settleTimer);
      pc.removeEventListener("icegatheringstatechange", onGathering);
      pc.removeEventListener("icecandidate", onCandidate);
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishFail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("ICE gathering timeout"));
    };

    const hardTimer = setTimeout(() => {
      if (sdpHasIceCandidates(pc.localDescription?.sdp)) finishOk();
      else finishFail();
    }, hardMs);

    const onGathering = () => {
      if (pc.iceGatheringState === "complete") finishOk();
    };

    const onCandidate = (ev: RTCPeerConnectionIceEvent) => {
      // null candidate = end-of-candidates (more reliable than gatheringState).
      if (ev.candidate === null) {
        finishOk();
        return;
      }
      if (sawCandidate) return;
      sawCandidate = true;
      settleTimer = setTimeout(() => {
        if (sdpHasIceCandidates(pc.localDescription?.sdp)) finishOk();
      }, settleMs);
    };

    pc.addEventListener("icegatheringstatechange", onGathering);
    pc.addEventListener("icecandidate", onCandidate);
    onGathering();
  });
}

function sendPresence(
  channel: RTCDataChannel,
  presence: { agentId: string; name: string }
): void {
  channel.send(
    JSON.stringify({
      type: "presence",
      agentId: presence.agentId,
      name: presence.name,
    } satisfies RosterPresenceMsg)
  );
}

function asArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }
  return null;
}

function attachChannel(
  channel: RTCDataChannel,
  handlers: RosterPeerHandlers,
  localPresence?: { agentId: string; name: string }
): void {
  channel.binaryType = "arraybuffer";
  channel.addEventListener("open", () => {
    if (localPresence) {
      try {
        sendPresence(channel, localPresence);
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
    handlers.onChannelOpen?.();
  });
  channel.addEventListener("close", () => handlers.onChannelClose?.());
  channel.addEventListener("message", ev => {
    try {
      if (typeof ev.data === "string") {
        handlers.onMessage?.(JSON.parse(ev.data));
        return;
      }
      const buf = asArrayBuffer(ev.data);
      if (buf && handlers.onBinary) {
        handlers.onBinary(buf);
        return;
      }
      if (buf) {
        handlers.onMessage?.(JSON.parse(new TextDecoder().decode(buf)));
      }
    } catch (e) {
      handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** True when iceServers include at least one `turn:`／`turns:` URL. */
export function sdpHasAvMediaLines(sdp: string | undefined | null): boolean {
  if (!sdp) return false;
  return /(?:^|\r?\n)m=audio /m.test(sdp) && /(?:^|\r?\n)m=video /m.test(sdp);
}

/** Reserve empty audio／video transceivers so later replaceTrack needs no renegotiation. */
export function reserveRosterMediaTransceivers(pc: {
  addTransceiver: (
    kind: string,
    init?: RTCRtpTransceiverInit
  ) => unknown;
}): void {
  pc.addTransceiver("audio", { direction: "sendrecv" });
  pc.addTransceiver("video", { direction: "sendrecv" });
}

export type RosterMediaMode = "none" | "ready";

export function iceServersIncludeTurn(
  iceServers?: RTCIceServer[]
): boolean {
  if (!iceServers || iceServers.length === 0) return false;
  return iceServers.some(s => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some(u => typeof u === "string" && /^turns?:/i.test(u));
  });
}

/**
 * RTCConfiguration for Roster peers.
 * Official TURN present → **relay-only**（PG-PLATFORM-CREDITS §7.2：不嘗試直連）.
 */
export function buildRosterRtcConfiguration(
  lan: boolean,
  iceServers?: RTCIceServer[]
): RTCConfiguration {
  if (lan) {
    return { iceServers: [] };
  }
  const servers =
    iceServers && iceServers.length > 0 ? iceServers : DEFAULT_STUN;
  if (iceServersIncludeTurn(servers)) {
    return { iceServers: servers, iceTransportPolicy: "relay" };
  }
  return { iceServers: servers };
}

function createPc(
  lan: boolean,
  iceServers?: RTCIceServer[]
): RTCPeerConnection {
  return new RTCPeerConnection(buildRosterRtcConfiguration(lan, iceServers));
}

function shouldKeepRelay(iceServers?: RTCIceServer[]): boolean {
  return iceServersIncludeTurn(iceServers);
}

function iceWaitOpts(iceServers?: RTCIceServer[]): {
  hardMs?: number;
  settleMs?: number;
} {
  if (!shouldKeepRelay(iceServers)) return {};
  return { hardMs: 20_000, settleMs: 6_000 };
}

function wrapSession(
  pc: RTCPeerConnection,
  role: "host" | "guest",
  getChannel: () => RTCDataChannel | null,
  handlers: RosterPeerHandlers
): RosterPeerSession {
  pc.addEventListener("connectionstatechange", () => {
    handlers.onConnectionState?.(pc.connectionState);
  });
  return {
    pc,
    getChannel,
    role,
    close: () => {
      try {
        getChannel()?.close();
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
      const channel = getChannel();
      if (!channel || channel.readyState !== "open") {
        throw new Error("DataChannel 尚未開啟");
      }
      channel.send(JSON.stringify(data));
    },
  };
}

/**
 * Wire size budget:
 * - `oob`（預設）：直掃／貼上 QR 上限 1200
 * - `signal`：Platform 短網址路徑；wire 走 API，用較大上限
 */
export type RosterWireTransport = "oob" | "signal";

function wireMaxChars(transport: RosterWireTransport | undefined): number {
  return transport === "signal"
    ? ROSTER_WIRE_MAX_CHARS_SIGNAL
    : ROSTER_WIRE_MAX_CHARS;
}

/** Create offer wire string (after ICE complete). Platform guest also uses this. */
export async function createRosterOffer(opts: {
  lan?: boolean;
  /** Default `oob`. Platform Invite must pass `signal`. */
  transport?: RosterWireTransport;
  handlers?: RosterPeerHandlers;
  /** Sent when DataChannel opens (mutual presence). */
  localPresence?: { agentId: string; name: string };
  /** Optional ICE servers (STUN＋official TURN). Omitted → default STUN.
   *  When TURN urls are present, PeerConnection is **relay-only**. */
  iceServers?: RTCIceServer[];
  /** `ready` reserves empty A/V transceivers in the first SDP (包廂). */
  media?: RosterMediaMode;
}): Promise<{ session: RosterPeerSession; wire: string }> {
  const lan = Boolean(opts.lan);
  const handlers = opts.handlers ?? {};
  const pc = createPc(lan, opts.iceServers);
  if (opts.media === "ready") reserveRosterMediaTransceivers(pc);
  const channel = pc.createDataChannel("roster", { ordered: true });
  attachChannel(channel, handlers, opts.localPresence);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc, iceWaitOpts(opts.iceServers));
  const local = pc.localDescription?.sdp;
  if (!local) throw new Error("缺少 local SDP");
  const fields = prepareFieldsForExchange(local, {
    lan,
    keepRelay: shouldKeepRelay(opts.iceServers),
  });
  const wire = encodeFieldsToRosterWire(fields, {
    role: "offer",
    lan,
    maxChars: wireMaxChars(opts.transport),
  });
  const session = wrapSession(pc, "host", () => channel, handlers);
  return { session, wire };
}

/** Accept offer wire → produce answer wire. Platform host answer loop uses this. */
export async function acceptRosterOffer(opts: {
  offerWire: string;
  lan?: boolean;
  /** Default `oob`. Platform Invite must pass `signal`. */
  transport?: RosterWireTransport;
  handlers?: RosterPeerHandlers;
  /** @deprecated use localPresence */
  presence?: { agentId: string; name: string };
  localPresence?: { agentId: string; name: string };
  iceServers?: RTCIceServer[];
  /** `ready` reserves empty A/V transceivers if the offer omitted them. */
  media?: RosterMediaMode;
}): Promise<{ session: RosterPeerSession; wire: string }> {
  const handlers = opts.handlers ?? {};
  const localPresence = opts.localPresence ?? opts.presence;
  const decoded = decodeRosterWireToSdp(opts.offerWire);
  if (decoded.role !== "offer") {
    throw new Error("期待 offer 字串");
  }
  const lan = opts.lan ?? decoded.lan;
  const pc = createPc(lan, opts.iceServers);
  if (opts.media === "ready" && !sdpHasAvMediaLines(decoded.sdp)) {
    reserveRosterMediaTransceivers(pc);
  }
  let channel: RTCDataChannel | null = null;

  pc.addEventListener("datachannel", ev => {
    channel = ev.channel;
    attachChannel(channel, handlers, localPresence);
  });

  await pc.setRemoteDescription({ type: "offer", sdp: decoded.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc, iceWaitOpts(opts.iceServers));
  const local = pc.localDescription?.sdp;
  if (!local) throw new Error("缺少 local SDP");
  const fields = prepareFieldsForExchange(local, {
    lan,
    keepRelay: shouldKeepRelay(opts.iceServers),
  });
  const wire = encodeFieldsToRosterWire(fields, {
    role: "answer" satisfies RosterSdpRole,
    lan,
    maxChars: wireMaxChars(opts.transport),
  });
  const session = wrapSession(pc, "guest", () => channel, handlers);
  return { session, wire };
}

/** Host: apply answer wire. */
export async function applyRosterAnswer(
  session: RosterPeerSession,
  answerWire: string
): Promise<void> {
  const decoded = decodeRosterWireToSdp(answerWire);
  if (decoded.role !== "answer") {
    throw new Error("期待 answer 字串");
  }
  await session.pc.setRemoteDescription({
    type: "answer",
    sdp: decoded.sdp,
  });
}

export function isPresenceMessage(data: unknown): data is RosterPresenceMsg {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  return (
    m.type === "presence" &&
    typeof m.agentId === "string" &&
    typeof m.name === "string"
  );
}

export function isAvatarRelayMessage(
  data: unknown
): data is RosterAvatarRelayMsg {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== "avatar_relay" || typeof m.from !== "string") return false;
  if (m.to !== undefined && typeof m.to !== "string") return false;
  if (!m.payload || typeof m.payload !== "object") return false;
  const payload = m.payload as Record<string, unknown>;
  return typeof payload.kind === "string";
}
