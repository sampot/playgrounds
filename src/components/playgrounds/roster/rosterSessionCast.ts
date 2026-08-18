/**
 * Program control plane over Roster DataChannel (PG-GO-ROOM-PLAN §9.6).
 * JSON only — never carries media bytes. Host fans out like session_chat.
 */

export const SESSION_CAST_TYPE = "session_cast" as const;
export const SESSION_CAST_VERSION = 1 as const;

export type SessionCastOp = "start" | "stop" | "state";
export type SessionCastKind = "audio" | "video";

export type SessionCastMessage = {
  type: typeof SESSION_CAST_TYPE;
  v: typeof SESSION_CAST_VERSION;
  op: SessionCastOp;
  from: string;
  kind?: SessionCastKind;
  name?: string;
  paused?: boolean;
  t?: number;
};

const CAST_OPS = new Set<SessionCastOp>(["start", "stop", "state"]);
const CAST_KINDS = new Set<SessionCastKind>(["audio", "video"]);
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
  if (m.op === "start") return Boolean(m.kind);
  return true;
}

export function buildSessionCastMessage(opts: {
  op: SessionCastOp;
  from: string;
  kind?: SessionCastKind;
  name?: string;
  paused?: boolean;
  t?: number;
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
  return msg;
}
