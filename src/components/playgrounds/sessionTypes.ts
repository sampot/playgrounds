/**
 * Multi-agent session types (DEC-023).
 */

export type SessionStatus = "idle" | "open" | "paused" | "closed";

/** Host-declared seat admission policy (SESSION spec §6.5). */
export type SessionJoinPolicy =
  "invite_only" | "apply" | "apply_with_approval" | "invite_or_apply";

/** Default when Host meta omits joinPolicy. */
export const DEFAULT_SESSION_JOIN_POLICY: SessionJoinPolicy = "invite_or_apply";

export type SessionJoinVia = "invite" | "apply";

export interface SessionProtocolMeta {
  protocolId: string;
  apiVersion: string;
  roles: string[];
  /** Optional max seats per role. */
  roleLimits?: Record<string, number>;
  capabilities?: string[];
  /** Seat admission policy; omitted → DEFAULT_SESSION_JOIN_POLICY at open. */
  joinPolicy?: SessionJoinPolicy;
}

export interface SessionSeat {
  seatId: string;
  role: string;
  kind: "human" | "agent";
  /** Agent project id when kind === "agent". */
  sandboxId: string | null;
  /** Participant-declared protocol at join (agents). */
  protocolId?: string;
  protocolApiVersion?: string;
  paused: boolean;
}

export interface MultiAgentSession {
  sessionId: string;
  hostSandboxId: string;
  /**
   * Sandbox that receives coding-orchestration host_apply fileWrites.
   * May differ from hostSandboxId (總管 Host ≠ 工作沙盒).
   */
  targetSandboxId?: string | null;
  status: Exclude<SessionStatus, "idle" | "closed">;
  protocol: SessionProtocolMeta;
  seats: SessionSeat[];
  /** Monotonic event sequence published on BroadcastChannel. */
  seq: number;
  channelName: string;
}

export interface SessionEventEnvelope {
  type: "session-event";
  sessionId: string;
  seq: number;
  event: unknown;
}

export interface JoinSeatOptions {
  sandboxId: string;
  role: string;
  protocolId: string;
  apiVersion: string;
  /** invite = Host pull-in; apply = participant request. Default apply. */
  via?: SessionJoinVia;
}

export interface OpenSessionOptions {
  /** Override protocol from Host meta (tests / HOST). */
  protocol?: SessionProtocolMeta;
  /** host_apply target (DEC-033); defaults to work sandbox at open. */
  targetSandboxId?: string | null;
}
