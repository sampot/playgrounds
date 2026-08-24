/**
 * Multi-track live recording control (PG-GO-ROOM-RECORD-PLAN §6).
 * JSON only — never media bytes.
 */

export const SESSION_RECORD_TYPE = "session_record" as const;
export const SESSION_RECORD_VERSION = 1 as const;

export type SessionRecordOp =
  | "start"
  | "stop"
  | "notify"
  | "done"
  | "error";

export type SessionRecordErrorCode =
  | "not_director"
  | "peer_not_live"
  | "already_recording"
  | "storage_full"
  | "encoder_failed"
  | "peer_gone";

export type SessionRecordMessage = {
  type: typeof SESSION_RECORD_TYPE;
  v: typeof SESSION_RECORD_VERSION;
  op: SessionRecordOp;
  from: string;
  targetPeer?: string;
  label?: string;
  active?: boolean;
  privateId?: string;
  name?: string;
  duration?: number;
  mime?: string;
  size?: number;
  code?: SessionRecordErrorCode;
  reason?: string;
};

const RECORD_OPS = new Set<SessionRecordOp>([
  "start",
  "stop",
  "notify",
  "done",
  "error",
]);
const RECORD_CODES = new Set<SessionRecordErrorCode>([
  "not_director",
  "peer_not_live",
  "already_recording",
  "storage_full",
  "encoder_failed",
  "peer_gone",
]);
const ID_MAX = 128;
const NAME_MAX = 200;
const REASON_MAX = 200;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

export function isSessionRecordMessage(
  data: unknown
): data is SessionRecordMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_RECORD_TYPE) return false;
  if (m.v !== SESSION_RECORD_VERSION) return false;
  if (typeof m.op !== "string" || !RECORD_OPS.has(m.op as SessionRecordOp)) {
    return false;
  }
  if (!isId(m.from)) return false;
  if (m.targetPeer !== undefined && !isId(m.targetPeer)) return false;
  if (m.label !== undefined) {
    if (typeof m.label !== "string" || m.label.length > NAME_MAX) return false;
  }
  if (m.active !== undefined && typeof m.active !== "boolean") return false;
  if (m.privateId !== undefined && !isId(m.privateId)) return false;
  if (m.name !== undefined) {
    if (typeof m.name !== "string" || m.name.length > NAME_MAX) return false;
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
  if (m.size !== undefined) {
    if (
      typeof m.size !== "number" ||
      !Number.isFinite(m.size) ||
      m.size < 0 ||
      !Number.isInteger(m.size)
    ) {
      return false;
    }
  }
  if (m.mime !== undefined) {
    if (typeof m.mime !== "string" || m.mime.length > NAME_MAX) return false;
  }
  if (m.code !== undefined && !RECORD_CODES.has(m.code as SessionRecordErrorCode)) {
    return false;
  }
  if (m.reason !== undefined) {
    if (typeof m.reason !== "string" || m.reason.length > REASON_MAX) return false;
  }
  if (m.op === "start" || m.op === "stop") {
    return Boolean(m.targetPeer);
  }
  if (m.op === "notify") {
    return Boolean(m.targetPeer) && typeof m.active === "boolean";
  }
  if (m.op === "done") {
    return Boolean(m.targetPeer) && Boolean(m.privateId) && Boolean(m.name);
  }
  if (m.op === "error") {
    return Boolean(m.targetPeer) && Boolean(m.code);
  }
  return true;
}

export function buildSessionRecordMessage(opts: {
  op: SessionRecordOp;
  from: string;
  targetPeer?: string;
  label?: string;
  active?: boolean;
  privateId?: string;
  name?: string;
  duration?: number;
  mime?: string;
  size?: number;
  code?: SessionRecordErrorCode;
  reason?: string;
}): SessionRecordMessage {
  const msg: SessionRecordMessage = {
    type: SESSION_RECORD_TYPE,
    v: SESSION_RECORD_VERSION,
    op: opts.op,
    from: opts.from,
  };
  if (opts.targetPeer) msg.targetPeer = opts.targetPeer;
  if (opts.label) msg.label = opts.label;
  if (opts.active !== undefined) msg.active = opts.active;
  if (opts.privateId) msg.privateId = opts.privateId;
  if (opts.name) msg.name = opts.name;
  if (opts.duration !== undefined) msg.duration = opts.duration;
  if (opts.mime) msg.mime = opts.mime;
  if (opts.size !== undefined) msg.size = opts.size;
  if (opts.code) msg.code = opts.code;
  if (opts.reason) msg.reason = opts.reason;
  return msg;
}
