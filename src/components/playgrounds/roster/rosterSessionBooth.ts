/**
 * Host moderation over Roster DataChannel (包廂：靜音／關鏡頭／請出).
 * JSON only — never media bytes. Hub star: Host sends; target matches `to`.
 */

export const SESSION_BOOTH_TYPE = "session_booth" as const;
export const SESSION_BOOTH_VERSION = 1 as const;

export type SessionBoothOp = "mute" | "camera_off" | "kick";

export type SessionBoothMessage = {
  type: typeof SESSION_BOOTH_TYPE;
  v: typeof SESSION_BOOTH_VERSION;
  op: SessionBoothOp;
  from: string;
  to: string;
};

const BOOTH_OPS = new Set<SessionBoothOp>(["mute", "camera_off", "kick"]);
const ID_MAX = 128;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

export function isSessionBoothMessage(
  data: unknown
): data is SessionBoothMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_BOOTH_TYPE) return false;
  if (m.v !== SESSION_BOOTH_VERSION) return false;
  if (typeof m.op !== "string" || !BOOTH_OPS.has(m.op as SessionBoothOp)) {
    return false;
  }
  return isId(m.from) && isId(m.to);
}

export function buildSessionBoothMessage(opts: {
  op: SessionBoothOp;
  from: string;
  to: string;
}): SessionBoothMessage {
  return {
    type: SESSION_BOOTH_TYPE,
    v: SESSION_BOOTH_VERSION,
    op: opts.op,
    from: opts.from,
    to: opts.to,
  };
}
