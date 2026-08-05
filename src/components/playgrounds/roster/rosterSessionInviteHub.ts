/**
 * Coordinates PlaygroundsApp ↔ AvatarsPanel for roster session invites (Phase 3.1).
 */

import type { MultiAgentSession } from "../sessionTypes";
import type { RosterAvatarRelayMsg } from "./rosterPeer";
import {
  buildSessionInvitePayload,
  type SessionInviteAcceptPayload,
  type SessionInvitePayload,
} from "./rosterSessionBridge";

export type RosterSessionOpenSnapshot = {
  sessionId: string;
  protocol: MultiAgentSession["protocol"];
  status: MultiAgentSession["status"];
};

export type RosterInviteAcceptedEvent = {
  peerAgentId: string;
  inviteId: string;
  sessionId: string;
  role: string;
  homeSandboxId?: string;
};

type Listener = () => void;

let openSession: RosterSessionOpenSnapshot | null = null;
let sendRelay:
  | ((payload: RosterAvatarRelayMsg["payload"], to?: string) => void)
  | null = null;
let getPeerAgentId: (() => string | null) | null = null;
let getProjectionSandboxId: ((peerAgentId: string) => string | undefined) | null =
  null;
let onAccepted:
  | ((ev: RosterInviteAcceptedEvent) => void | Promise<void>)
  | null = null;

const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeRosterSessionHub(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setRosterOpenSession(
  session: RosterSessionOpenSnapshot | null
): void {
  openSession = session
    ? {
        sessionId: session.sessionId,
        protocol: { ...session.protocol, roles: [...session.protocol.roles] },
        status: session.status,
      }
    : null;
  emit();
}

export function getRosterOpenSession(): RosterSessionOpenSnapshot | null {
  return openSession;
}

export function registerRosterRelayTransport(opts: {
  send: (payload: RosterAvatarRelayMsg["payload"], to?: string) => void;
  getPeerAgentId: () => string | null;
  getProjectionSandboxId: (peerAgentId: string) => string | undefined;
}): () => void {
  sendRelay = opts.send;
  getPeerAgentId = opts.getPeerAgentId;
  getProjectionSandboxId = opts.getProjectionSandboxId;
  emit();
  return () => {
    if (sendRelay === opts.send) sendRelay = null;
    if (getPeerAgentId === opts.getPeerAgentId) getPeerAgentId = null;
    if (getProjectionSandboxId === opts.getProjectionSandboxId) {
      getProjectionSandboxId = null;
    }
    emit();
  };
}

export function registerRosterInviteAcceptedHandler(
  handler: (ev: RosterInviteAcceptedEvent) => void | Promise<void>
): () => void {
  onAccepted = handler;
  return () => {
    if (onAccepted === handler) onAccepted = null;
  };
}

export function rosterInvitePeerAvailable(): boolean {
  return Boolean(getPeerAgentId?.());
}

export function rosterCanInviteToSession(): boolean {
  return Boolean(
    openSession &&
      (openSession.status === "open" || openSession.status === "paused") &&
      sendRelay &&
      getPeerAgentId?.()
  );
}

/**
 * Host: send session_invite to the connected roster peer.
 * Returns the invite payload (for outbound tracking).
 */
export function inviteRosterAvatarToSession(opts?: {
  role?: string;
}): SessionInvitePayload {
  if (!openSession) throw new Error("尚未開啟多人通道");
  if (!sendRelay) throw new Error("化身連線尚未就緒");
  const peerId = getPeerAgentId?.();
  if (!peerId) throw new Error("還沒有連線中的化身");
  const role =
    opts?.role?.trim() ||
    openSession.protocol.roles.find(r => r !== "human") ||
    "participant";
  const invite = buildSessionInvitePayload({
    sessionId: openSession.sessionId,
    protocol: openSession.protocol,
    role,
  });
  sendRelay(invite, peerId);
  return invite;
}

export function notifyRosterInviteAccepted(
  ev: RosterInviteAcceptedEvent
): void {
  void onAccepted?.(ev);
}

export function getRosterProjectionSandboxId(
  peerAgentId: string
): string | undefined {
  return getProjectionSandboxId?.(peerAgentId);
}

/** Test helper — clear hub state. */
export function resetRosterSessionHubForTests(): void {
  openSession = null;
  sendRelay = null;
  getPeerAgentId = null;
  getProjectionSandboxId = null;
  onAccepted = null;
  listeners.clear();
}

export type { SessionInvitePayload, SessionInviteAcceptPayload };
