/**
 * Hang／pull like session_file for catalog; TV offer is room-level (PG-GO-ROOM-PLAN §9.7／§9.8).
 * JSON only — never media bytes.
 */

export const SESSION_CAST_TYPE = "session_cast" as const;
export const SESSION_CAST_VERSION = 1 as const;

export type SessionCastOp =
  | "offer"
  | "unoffer"
  | "request"
  | "release"
  | "state"
  | "reject";
export type SessionCastKind = "audio" | "video";
/** Share catalog vs host-only OPFS library (PG-GO-ROOM-PLAN §5.5.1). */
export type SessionCastScope = "share" | "private";

export type SessionCastMessage = {
  type: typeof SESSION_CAST_TYPE;
  v: typeof SESSION_CAST_VERSION;
  op: SessionCastOp;
  from: string;
  kind?: SessionCastKind;
  name?: string;
  paused?: boolean;
  t?: number;
  /** Source clock length for host HUD when owner ≠ host. */
  duration?: number;
  id?: string;
  /** Program RTP source peer when casting another occupant's file／live. */
  fromPeer?: string;
  /** Reject／error copy for the director (e.g. Safari cannot be program source). */
  reason?: string;
  /** Omit／share = 分享目錄；private = Host OPFS（不進 `/room-file`）. */
  scope?: SessionCastScope;
};

const CAST_OPS = new Set<SessionCastOp>([
  "offer",
  "unoffer",
  "request",
  "release",
  "state",
  "reject",
]);
const CAST_KINDS = new Set<SessionCastKind>(["audio", "video"]);
const CAST_SCOPES = new Set<SessionCastScope>(["share", "private"]);
const ID_MAX = 128;
const NAME_MAX = 200;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

export function isSessionCastMessage(data: unknown): data is SessionCastMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_CAST_TYPE) return false;
  if (m.v !== SESSION_CAST_VERSION) return false;
  if (typeof m.op !== "string" || !CAST_OPS.has(m.op as SessionCastOp)) {
    return false;
  }
  if (!isId(m.from)) return false;
  if (m.kind !== undefined && !CAST_KINDS.has(m.kind as SessionCastKind)) {
    return false;
  }
  if (m.name !== undefined) {
    if (typeof m.name !== "string" || m.name.length > NAME_MAX) return false;
  }
  if (m.paused !== undefined && typeof m.paused !== "boolean") return false;
  if (m.t !== undefined) {
    if (typeof m.t !== "number" || !Number.isFinite(m.t) || m.t < 0) return false;
  }
  if (m.duration !== undefined) {
    if (
      typeof m.duration !== "number" ||
      !Number.isFinite(m.duration) ||
      m.duration < 0
    ) {
      return false;
    }
  }
  if (m.id !== undefined && !isId(m.id)) return false;
  if (m.fromPeer !== undefined && !isId(m.fromPeer)) return false;
  if (m.reason !== undefined) {
    if (typeof m.reason !== "string" || m.reason.length > NAME_MAX) return false;
  }
  if (m.scope !== undefined && !CAST_SCOPES.has(m.scope as SessionCastScope)) {
    return false;
  }
  if (m.op === "offer") return Boolean(m.kind);
  return true;
}

export function buildSessionCastMessage(opts: {
  op: SessionCastOp;
  from: string;
  kind?: SessionCastKind;
  name?: string;
  paused?: boolean;
  t?: number;
  duration?: number;
  id?: string;
  fromPeer?: string;
  reason?: string;
  scope?: SessionCastScope;
}): SessionCastMessage {
  const msg: SessionCastMessage = {
    type: SESSION_CAST_TYPE,
    v: SESSION_CAST_VERSION,
    op: opts.op,
    from: opts.from,
  };
  if (opts.kind) msg.kind = opts.kind;
  if (opts.name) msg.name = opts.name;
  if (opts.paused !== undefined) msg.paused = opts.paused;
  if (opts.t !== undefined) msg.t = opts.t;
  if (opts.duration !== undefined) msg.duration = opts.duration;
  if (opts.id) msg.id = opts.id;
  if (opts.fromPeer) msg.fromPeer = opts.fromPeer;
  if (opts.reason) msg.reason = opts.reason;
  if (opts.scope) msg.scope = opts.scope;
  return msg;
}
