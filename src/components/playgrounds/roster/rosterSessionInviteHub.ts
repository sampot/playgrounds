/**
 * Coordinates PlaygroundsApp ↔ AvatarsPanel for roster session invites／act (DEC-045).
 */

import type { MultiAgentSession } from "../sessionTypes";
import type { RosterAvatarRelayMsg } from "./rosterPeer";
import {
  buildSessionInvitePayload,
  type SessionActPayload,
  type SessionInviteAcceptPayload,
  type SessionInvitePayload,
  type SessionSeatBoundPayload,
} from "./rosterSessionBridge";

/** Catalog hint when inviting into coding-orchestration.v1 (DEC-045／046). */
const CODING_ORCH_PROTOCOL_ID = "coding-orchestration.v1";
const CODING_ORCH_CATALOG_ID = "pg-llm-agent";
const CODING_ORCH_CATALOG_SOURCE = "sampot/pg-llm-agent";
const CODING_ORCH_DEFAULT_ROLE = "worker";

/** Catalog hint when inviting into gomoku.v1 (PG-INVITE-E2E-MVP). */
const GOMOKU_PROTOCOL_ID = "gomoku.v1";
const GOMOKU_CATALOG_ID = "pg-gomoku";
const GOMOKU_CATALOG_SOURCE = "sampot/pg-gomoku";
const GOMOKU_DEFAULT_ROLE = "player";

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

export type RosterRemoteActRequest = {
  fromPeerId: string;
  act: SessionActPayload;
};

export type RosterHomeSeatReadyEvent = {
  sandboxId: string;
  seatId: string;
  sessionId: string;
  inviteId: string;
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
let onRemoteAct:
  | ((ev: RosterRemoteActRequest) => void | Promise<void>)
  | null = null;
let onHomeSeatReady:
  | ((ev: RosterHomeSeatReadyEvent) => void | Promise<void>)
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

/** Send any avatar_relay payload (invite／seat_bound／act／event). */
export function sendRosterRelayPayload(
  payload: RosterAvatarRelayMsg["payload"],
  to?: string
): void {
  if (!sendRelay) throw new Error("化身連線尚未就緒");
  sendRelay(payload, to);
}

export function registerRosterInviteAcceptedHandler(
  handler: (ev: RosterInviteAcceptedEvent) => void | Promise<void>
): () => void {
  onAccepted = handler;
  return () => {
    if (onAccepted === handler) onAccepted = null;
  };
}

export function registerRosterRemoteActHandler(
  handler: (ev: RosterRemoteActRequest) => void | Promise<void>
): () => void {
  onRemoteAct = handler;
  return () => {
    if (onRemoteAct === handler) onRemoteAct = null;
  };
}

export function registerRosterHomeSeatReadyHandler(
  handler: (ev: RosterHomeSeatReadyEvent) => void | Promise<void>
): () => void {
  onHomeSeatReady = handler;
  return () => {
    if (onHomeSeatReady === handler) onHomeSeatReady = null;
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
  catalogId?: string;
  source?: string;
}): SessionInvitePayload {
  if (!openSession) throw new Error("尚未開啟多人通道");
  if (!sendRelay) throw new Error("化身連線尚未就緒");
  const peerId = getPeerAgentId?.();
  if (!peerId) throw new Error("還沒有連線中的化身");
  const protocolId = openSession.protocol.protocolId;
  const isCodingOrch = protocolId === CODING_ORCH_PROTOCOL_ID;
  const isGomoku = protocolId === GOMOKU_PROTOCOL_ID;
  const role =
    opts?.role?.trim() ||
    (isCodingOrch
      ? CODING_ORCH_DEFAULT_ROLE
      : isGomoku
        ? GOMOKU_DEFAULT_ROLE
        : openSession.protocol.roles.find(
            r => r !== "human" && r !== "host"
          ) || "participant");
  const catalogId =
    opts?.catalogId?.trim() ||
    (isCodingOrch
      ? CODING_ORCH_CATALOG_ID
      : isGomoku
        ? GOMOKU_CATALOG_ID
        : undefined);
  const source =
    opts?.source?.trim() ||
    (isCodingOrch
      ? CODING_ORCH_CATALOG_SOURCE
      : isGomoku
        ? GOMOKU_CATALOG_SOURCE
        : undefined);
  const invite = buildSessionInvitePayload({
    sessionId: openSession.sessionId,
    protocol: openSession.protocol,
    role,
    ...(catalogId ? { catalogId } : {}),
    ...(source ? { source } : {}),
  });
  sendRelay(invite, peerId);
  return invite;
}

export function notifyRosterInviteAccepted(
  ev: RosterInviteAcceptedEvent
): void {
  void onAccepted?.(ev);
}

export function notifyRosterRemoteAct(ev: RosterRemoteActRequest): void {
  void onRemoteAct?.(ev);
}

export function notifyRosterHomeSeatReady(ev: RosterHomeSeatReadyEvent): void {
  void onHomeSeatReady?.(ev);
}

export function getRosterProjectionSandboxId(
  peerAgentId: string
): string | undefined {
  return getProjectionSandboxId?.(peerAgentId);
}

export function getRosterConnectedPeerId(): string | null {
  return getPeerAgentId?.() ?? null;
}

export function sendSessionSeatBound(
  bound: SessionSeatBoundPayload,
  toPeerId: string
): void {
  sendRosterRelayPayload(bound, toPeerId);
}

/** Test helper — clear hub state. */
export function resetRosterSessionHubForTests(): void {
  openSession = null;
  sendRelay = null;
  getPeerAgentId = null;
  getProjectionSandboxId = null;
  onAccepted = null;
  onRemoteAct = null;
  onHomeSeatReady = null;
  listeners.clear();
}

export type { SessionInvitePayload, SessionInviteAcceptPayload };
