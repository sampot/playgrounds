/**
 * Roster WebRTC peer: one non-trickle offer/answer + DataChannel (DEC-045).
 */

import {
  prepareFieldsForExchange,
  type RosterSdpRole,
} from "./rosterSdpCodec";
import { encodeFieldsToRosterWire, decodeRosterWireToSdp } from "./rosterWire";

const DEFAULT_STUN = [{ urls: "stun:stun.cloudflare.com:3478" }];

export type RosterPresenceMsg = {
  type: "presence";
  agentId: string;
  name: string;
};

export type RosterPeerHandlers = {
  onChannelOpen?: () => void;
  onChannelClose?: () => void;
  onConnectionState?: (state: RTCPeerConnectionState) => void;
  onMessage?: (data: unknown) => void;
  onError?: (err: Error) => void;
};

export type RosterPeerSession = {
  pc: RTCPeerConnection;
  getChannel: () => RTCDataChannel | null;
  role: "host" | "guest";
  close: () => void;
  send: (data: unknown) => void;
};

function waitIceComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("ICE gathering timeout"));
    }, 20_000);
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      clearTimeout(t);
      pc.removeEventListener("icegatheringstatechange", onChange);
    };
    pc.addEventListener("icegatheringstatechange", onChange);
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
      const text =
        typeof ev.data === "string"
          ? ev.data
          : new TextDecoder().decode(ev.data as ArrayBuffer);
      handlers.onMessage?.(JSON.parse(text));
    } catch (e) {
      handlers.onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function createPc(lan: boolean): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: lan ? [] : DEFAULT_STUN,
  });
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

/** Host: create offer wire string (after ICE complete). */
export async function createRosterOffer(opts: {
  lan?: boolean;
  handlers?: RosterPeerHandlers;
  /** Sent when DataChannel opens (mutual presence). */
  localPresence?: { agentId: string; name: string };
}): Promise<{ session: RosterPeerSession; wire: string }> {
  const lan = Boolean(opts.lan);
  const handlers = opts.handlers ?? {};
  const pc = createPc(lan);
  const channel = pc.createDataChannel("roster", { ordered: true });
  attachChannel(channel, handlers, opts.localPresence);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceComplete(pc);
  const local = pc.localDescription?.sdp;
  if (!local) throw new Error("缺少 local SDP");
  const fields = prepareFieldsForExchange(local, { lan });
  const wire = encodeFieldsToRosterWire(fields, { role: "offer", lan });
  const session = wrapSession(pc, "host", () => channel, handlers);
  return { session, wire };
}

/** Guest: accept offer wire → produce answer wire. */
export async function acceptRosterOffer(opts: {
  offerWire: string;
  lan?: boolean;
  handlers?: RosterPeerHandlers;
  /** @deprecated use localPresence */
  presence?: { agentId: string; name: string };
  localPresence?: { agentId: string; name: string };
}): Promise<{ session: RosterPeerSession; wire: string }> {
  const handlers = opts.handlers ?? {};
  const localPresence = opts.localPresence ?? opts.presence;
  const decoded = decodeRosterWireToSdp(opts.offerWire);
  if (decoded.role !== "offer") {
    throw new Error("期待 offer 字串");
  }
  const lan = opts.lan ?? decoded.lan;
  const pc = createPc(lan);
  let channel: RTCDataChannel | null = null;

  pc.addEventListener("datachannel", ev => {
    channel = ev.channel;
    attachChannel(channel, handlers, localPresence);
  });

  await pc.setRemoteDescription({ type: "offer", sdp: decoded.sdp });
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await waitIceComplete(pc);
  const local = pc.localDescription?.sdp;
  if (!local) throw new Error("缺少 local SDP");
  const fields = prepareFieldsForExchange(local, { lan });
  const wire = encodeFieldsToRosterWire(fields, {
    role: "answer" satisfies RosterSdpRole,
    lan,
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
