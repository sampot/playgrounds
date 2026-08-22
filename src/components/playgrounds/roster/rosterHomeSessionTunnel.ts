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

/**
 * Read-only env.SESSION for booth spectators (same canvas, no act).
 */
export function createRosterSessionWatchBridge(opts: {
  sessionId: string;
  channelName: string;
  homeSandboxId: string;
  /** When set, `act({ type: "sync" })` tunnels to Host for fogged state. */
  hostPeerId?: string;
  inviteId?: string;
  send?: RosterTunnelSend;
}): SessionBridge {
  const { sessionId, channelName, homeSandboxId, hostPeerId, inviteId, send } =
    opts;
  return {
    async apiVersion() {
      return SESSION_API_VERSION;
    },
    async capabilities() {
      return [...SESSION_CAPABILITIES];
    },
    async getSeat(): Promise<SessionSeatInfo> {
      return {
        sessionId,
        seatId: "spectator",
        role: "spectator",
        participantId: homeSandboxId,
        hostSandboxId: "remote-host",
        status: "open",
        ready: false,
      } as SessionSeatInfo;
    },
    async getState() {
      return {
        ready: true,
        status: "waiting",
        channelName,
        note: "觀戰中 — 畫面隨對局更新",
      };
    },
    async getEventChannel() {
      return { name: channelName };
    },
    async act(payload: unknown) {
      const type =
        payload && typeof payload === "object"
          ? String((payload as { type?: unknown }).type || "").trim()
          : "";
      if (type !== "sync") {
        throw new SessionBridgeError("forbidden", "觀戰席不可落子");
      }
      if (!send || !hostPeerId) {
        throw new SessionBridgeError("not_ready", "觀戰通道尚未就緒");
      }
      return requestSessionActOverRelay({
        inviteId: inviteId || "spectator-watch",
        sessionId,
        seatId: "spectator",
        payload,
        send,
        toPeerId: hostPeerId,
      });
    },
    async leave() {
      /* no-op — booth host ends the play */
    },
  };
}

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
        note: "對局狀態以即時更新為準",
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
        "請在主持端請離此座位"
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
  // Defer close — some engines (Edge) drop in-flight posts if closed sync.
  setTimeout(() => {
    try {
      channel.close();
    } catch {
      /* ignore */
    }
  }, 0);
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
