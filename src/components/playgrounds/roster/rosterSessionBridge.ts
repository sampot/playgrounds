/**
 * Roster ↔ session payloads over avatar_relay (DEC-045 Phase 3).
 * Slice 1: invite handshake. Slice 2: act／event tunnel.
 */

import type {
  SessionJoinPolicy,
  SessionProtocolMeta,
} from "../sessionTypes";

export const SESSION_INVITE_KIND = "session_invite" as const;
export const SESSION_INVITE_ACCEPT_KIND = "session_invite_accept" as const;
export const SESSION_INVITE_REJECT_KIND = "session_invite_reject" as const;
export const SESSION_INVITE_CANCEL_KIND = "session_invite_cancel" as const;

export const SESSION_SEAT_BOUND_KIND = "session_seat_bound" as const;
export const SESSION_ACT_KIND = "session_act" as const;
export const SESSION_ACT_RESULT_KIND = "session_act_result" as const;
export const SESSION_EVENT_KIND = "session_event" as const;

export type RosterSessionProtocolSpec = {
  protocolId: string;
  apiVersion: string;
  roles: string[];
  capabilities?: string[];
  joinPolicy?: SessionJoinPolicy | string;
  roleLimits?: Record<string, number>;
};

export type SessionInvitePayload = {
  kind: typeof SESSION_INVITE_KIND;
  inviteId: string;
  sessionId: string;
  protocol: RosterSessionProtocolSpec;
  role: string;
  catalogId?: string;
  source?: string;
};

export type SessionInviteAcceptPayload = {
  kind: typeof SESSION_INVITE_ACCEPT_KIND;
  inviteId: string;
  sessionId: string;
  role: string;
  /** Booth consent nickname — preferred over roster presence for in-game names. */
  displayName?: string;
  /** homePeer local participant sandbox (prepared; authority stays there). */
  homeSandboxId?: string;
};

export type SessionInviteRejectPayload = {
  kind: typeof SESSION_INVITE_REJECT_KIND;
  inviteId: string;
  sessionId: string;
  reason?: string;
};

export type SessionInviteCancelPayload = {
  kind: typeof SESSION_INVITE_CANCEL_KIND;
  inviteId: string;
  sessionId: string;
};

/** Host → homePeer after projection seat joined. */
export type SessionSeatBoundPayload = {
  kind: typeof SESSION_SEAT_BOUND_KIND;
  inviteId: string;
  sessionId: string;
  seatId: string;
  role: string;
  channelName: string;
};

/** homePeer → Host: participant act. */
export type SessionActPayload = {
  kind: typeof SESSION_ACT_KIND;
  inviteId: string;
  sessionId: string;
  seatId: string;
  requestId: string;
  payload: unknown;
};

/** Host → homePeer: act response. */
export type SessionActResultPayload = {
  kind: typeof SESSION_ACT_RESULT_KIND;
  requestId: string;
  sessionId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
};

/** Host → homePeer: one session event. */
export type SessionEventRelayPayload = {
  kind: typeof SESSION_EVENT_KIND;
  sessionId: string;
  seq: number;
  event: unknown;
};

export type SessionInviteKindPayload =
  | SessionInvitePayload
  | SessionInviteAcceptPayload
  | SessionInviteRejectPayload
  | SessionInviteCancelPayload;

export type SessionTunnelKindPayload =
  | SessionSeatBoundPayload
  | SessionActPayload
  | SessionActResultPayload
  | SessionEventRelayPayload;

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}

function parseProtocol(raw: unknown): RosterSessionProtocolSpec | null {
  if (!isRecord(raw)) return null;
  const protocolId =
    typeof raw.protocolId === "string" ? raw.protocolId.trim() : "";
  const apiVersion =
    typeof raw.apiVersion === "string" ? raw.apiVersion.trim() : "";
  if (!protocolId || !apiVersion) return null;
  const roles = Array.isArray(raw.roles)
    ? raw.roles.filter(
        (r): r is string => typeof r === "string" && !!r.trim()
      )
    : [];
  const out: RosterSessionProtocolSpec = {
    protocolId,
    apiVersion,
    roles,
  };
  if (Array.isArray(raw.capabilities)) {
    const caps = raw.capabilities.filter(
      (c): c is string => typeof c === "string" && !!c.trim()
    );
    if (caps.length) out.capabilities = caps;
  }
  if (typeof raw.joinPolicy === "string" && raw.joinPolicy.trim()) {
    out.joinPolicy = raw.joinPolicy.trim();
  }
  if (raw.roleLimits && typeof raw.roleLimits === "object") {
    const limits: Record<string, number> = {};
    for (const [k, v] of Object.entries(
      raw.roleLimits as Record<string, unknown>
    )) {
      if (typeof v === "number" && Number.isFinite(v)) limits[k] = v;
    }
    if (Object.keys(limits).length) out.roleLimits = limits;
  }
  return out;
}

export function isSessionInvitePayload(
  data: unknown
): data is SessionInvitePayload {
  if (!isRecord(data) || data.kind !== SESSION_INVITE_KIND) return false;
  if (typeof data.inviteId !== "string" || !data.inviteId.trim()) return false;
  if (typeof data.sessionId !== "string" || !data.sessionId.trim()) return false;
  if (typeof data.role !== "string" || !data.role.trim()) return false;
  return parseProtocol(data.protocol) !== null;
}

export function isSessionInviteAcceptPayload(
  data: unknown
): data is SessionInviteAcceptPayload {
  if (!isRecord(data) || data.kind !== SESSION_INVITE_ACCEPT_KIND) return false;
  return (
    typeof data.inviteId === "string" &&
    !!data.inviteId.trim() &&
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim() &&
    typeof data.role === "string" &&
    !!data.role.trim()
  );
}

export function isSessionInviteRejectPayload(
  data: unknown
): data is SessionInviteRejectPayload {
  if (!isRecord(data) || data.kind !== SESSION_INVITE_REJECT_KIND) return false;
  return (
    typeof data.inviteId === "string" &&
    !!data.inviteId.trim() &&
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim()
  );
}

export function isSessionInviteCancelPayload(
  data: unknown
): data is SessionInviteCancelPayload {
  if (!isRecord(data) || data.kind !== SESSION_INVITE_CANCEL_KIND) return false;
  return (
    typeof data.inviteId === "string" &&
    !!data.inviteId.trim() &&
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim()
  );
}

export function isSessionInviteKindPayload(
  data: unknown
): data is SessionInviteKindPayload {
  return (
    isSessionInvitePayload(data) ||
    isSessionInviteAcceptPayload(data) ||
    isSessionInviteRejectPayload(data) ||
    isSessionInviteCancelPayload(data)
  );
}

export function isSessionSeatBoundPayload(
  data: unknown
): data is SessionSeatBoundPayload {
  if (!isRecord(data) || data.kind !== SESSION_SEAT_BOUND_KIND) return false;
  return (
    typeof data.inviteId === "string" &&
    !!data.inviteId.trim() &&
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim() &&
    typeof data.seatId === "string" &&
    !!data.seatId.trim() &&
    typeof data.role === "string" &&
    !!data.role.trim() &&
    typeof data.channelName === "string" &&
    !!data.channelName.trim()
  );
}

export function isSessionActPayload(data: unknown): data is SessionActPayload {
  if (!isRecord(data) || data.kind !== SESSION_ACT_KIND) return false;
  return (
    typeof data.inviteId === "string" &&
    !!data.inviteId.trim() &&
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim() &&
    typeof data.seatId === "string" &&
    !!data.seatId.trim() &&
    typeof data.requestId === "string" &&
    !!data.requestId.trim() &&
    "payload" in data
  );
}

export function isSessionActResultPayload(
  data: unknown
): data is SessionActResultPayload {
  if (!isRecord(data) || data.kind !== SESSION_ACT_RESULT_KIND) return false;
  if (typeof data.requestId !== "string" || !data.requestId.trim()) return false;
  if (typeof data.sessionId !== "string" || !data.sessionId.trim()) return false;
  if (typeof data.ok !== "boolean") return false;
  return true;
}

export function isSessionEventRelayPayload(
  data: unknown
): data is SessionEventRelayPayload {
  if (!isRecord(data) || data.kind !== SESSION_EVENT_KIND) return false;
  return (
    typeof data.sessionId === "string" &&
    !!data.sessionId.trim() &&
    typeof data.seq === "number" &&
    Number.isFinite(data.seq) &&
    "event" in data
  );
}

export function isSessionTunnelKindPayload(
  data: unknown
): data is SessionTunnelKindPayload {
  return (
    isSessionSeatBoundPayload(data) ||
    isSessionActPayload(data) ||
    isSessionActResultPayload(data) ||
    isSessionEventRelayPayload(data)
  );
}

export function newSessionInviteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newSessionActRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build invite payload from an open MultiAgentSession protocol. */
export function buildSessionInvitePayload(opts: {
  sessionId: string;
  protocol: SessionProtocolMeta;
  role: string;
  inviteId?: string;
  catalogId?: string;
  source?: string;
}): SessionInvitePayload {
  const role = opts.role.trim();
  if (!role) throw new Error("邀請需要 role");
  const protocol: RosterSessionProtocolSpec = {
    protocolId: opts.protocol.protocolId,
    apiVersion: opts.protocol.apiVersion,
    roles: [...opts.protocol.roles],
  };
  if (opts.protocol.capabilities?.length) {
    protocol.capabilities = [...opts.protocol.capabilities];
  }
  if (opts.protocol.joinPolicy) {
    protocol.joinPolicy = opts.protocol.joinPolicy;
  }
  if (opts.protocol.roleLimits) {
    protocol.roleLimits = { ...opts.protocol.roleLimits };
  }
  const payload: SessionInvitePayload = {
    kind: SESSION_INVITE_KIND,
    inviteId: opts.inviteId?.trim() || newSessionInviteId(),
    sessionId: opts.sessionId,
    protocol,
    role,
  };
  if (opts.catalogId?.trim()) payload.catalogId = opts.catalogId.trim();
  if (opts.source?.trim()) payload.source = opts.source.trim();
  return payload;
}

/** Normalize invite protocol into SessionProtocolSpec-ish for catalog match. */
export function sessionInviteToCatalogSpec(invite: SessionInvitePayload): {
  protocolId: string;
  apiVersion: string;
  role?: string;
  catalogId?: string;
  source?: string;
} {
  return {
    protocolId: invite.protocol.protocolId,
    apiVersion: invite.protocol.apiVersion,
    role: invite.role,
    ...(invite.catalogId ? { catalogId: invite.catalogId } : {}),
    ...(invite.source ? { source: invite.source } : {}),
  };
}
