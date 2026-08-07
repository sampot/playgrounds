/**
 * homePeer env.SESSION implementation that tunnels act over Roster DC (DEC-045 Phase 3.2).
 */

import {
  SESSION_API_VERSION,
  SESSION_CAPABILITIES,
  SessionBridgeError,
  type SessionBridge,
  type SessionSeatInfo,
} from "../sessionBridge";
import { publishSessionEvent } from "../sessionBroadcast";
import type { SessionEventEnvelope } from "../sessionTypes";
import {
  requestSessionActOverRelay,
  resolveSessionActResult,
} from "./rosterSessionActTunnel";
import type {
  SessionActPayload,
  SessionActResultPayload,
  SessionEventRelayPayload,
  SessionSeatBoundPayload,
} from "./rosterSessionBridge";

export type RosterTunnelSend = (
  payload: SessionActPayload,
  to?: string
) => void;

export type RosterHomeSeatBinding = {
  inviteId: string;
  sessionId: string;
  seatId: string;
  role: string;
  channelName: string;
  homeSandboxId: string;
  hostPeerId: string;
  status: "open" | "paused";
};

export function createRosterSessionTunnelBridge(opts: {
  binding: RosterHomeSeatBinding;
  send: RosterTunnelSend;
}): SessionBridge {
  const { binding, send } = opts;

  return {
    async apiVersion() {
      return SESSION_API_VERSION;
    },
    async capabilities() {
      return [...SESSION_CAPABILITIES];
    },
    async getSeat(): Promise<SessionSeatInfo> {
      return {
        sessionId: binding.sessionId,
        seatId: binding.seatId,
        role: binding.role,
        participantId: binding.homeSandboxId,
        hostSandboxId: "remote-host",
        status: binding.status,
        // Extra field consumed by SAMs that gate on seat.ready (e.g. pg-gomoku).
        ready: true,
      } as SessionSeatInfo;
    },
    async getState() {
      return {
        ready: true,
        note: "遠端 getState 尚未隧道；以事件為準",
      };
    },
    async getEventChannel() {
      return { name: binding.channelName };
    },
    async act(payload: unknown) {
      return requestSessionActOverRelay({
        inviteId: binding.inviteId,
        sessionId: binding.sessionId,
        seatId: binding.seatId,
        payload,
        send,
        toPeerId: binding.hostPeerId,
      });
    },
    async leave() {
      throw new SessionBridgeError(
        "forbidden",
        "遠端座位請在主持場請離（leave 隧道未通）"
      );
    },
  };
}

/** Deliver Host session_event onto the local BroadcastChannel. */
export function publishRosterRelayedSessionEvent(
  channelName: string,
  relay: SessionEventRelayPayload
): void {
  const channel = new BroadcastChannel(channelName);
  const envelope: SessionEventEnvelope = {
    type: "session-event",
    sessionId: relay.sessionId,
    seq: relay.seq,
    event: relay.event,
  };
  publishSessionEvent(channel, envelope);
  try {
    channel.close();
  } catch {
    /* ignore */
  }
}

export function applySessionActResultFromRelay(
  data: SessionActResultPayload
): boolean {
  return resolveSessionActResult(data);
}

export function bindingFromSeatBound(
  bound: SessionSeatBoundPayload,
  homeSandboxId: string,
  hostPeerId: string
): RosterHomeSeatBinding {
  return {
    inviteId: bound.inviteId,
    sessionId: bound.sessionId,
    seatId: bound.seatId,
    role: bound.role,
    channelName: bound.channelName,
    homeSandboxId,
    hostPeerId,
    status: "open",
  };
}
