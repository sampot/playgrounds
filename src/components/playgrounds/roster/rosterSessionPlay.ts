/**
 * Booth play control plane (PG-GO-ROOM-PLAY-PLAN §7).
 * JSON only — never SAM bytes／act payloads.
 */

export const SESSION_PLAY_TYPE = "session_play" as const;
export const SESSION_PLAY_VERSION = 1 as const;

export type SessionPlayOp = "offer" | "end";

export type SessionPlaySeat = {
  role: string;
  peerId: string;
};

export type SessionPlayOfferMessage = {
  type: typeof SESSION_PLAY_TYPE;
  v: typeof SESSION_PLAY_VERSION;
  op: "offer";
  from: string;
  catalogId: string;
  rev?: string;
  seats: SessionPlaySeat[];
  /** Present after Host SAM open — spectators／late join bind event channel. */
  sessionId?: string;
  channelName?: string;
};

export type SessionPlayEndMessage = {
  type: typeof SESSION_PLAY_TYPE;
  v: typeof SESSION_PLAY_VERSION;
  op: "end";
  from: string;
};

export type SessionPlayMessage = SessionPlayOfferMessage | SessionPlayEndMessage;

const PLAY_OPS = new Set<SessionPlayOp>(["offer", "end"]);
const ID_MAX = 128;
const CATALOG_ID_MAX = 128;
const REV_MAX = 128;
const ROLE_MAX = 64;
const SEATS_MAX = 16;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

function isCatalogId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= CATALOG_ID_MAX
  );
}

function isRole(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ROLE_MAX;
}

function parseSeats(value: unknown): SessionPlaySeat[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > SEATS_MAX) {
    return null;
  }
  const seats: SessionPlaySeat[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object") return null;
    const r = row as Record<string, unknown>;
    if (!isRole(r.role) || !isId(r.peerId)) return null;
    if (seen.has(r.peerId)) return null;
    seen.add(r.peerId);
    seats.push({ role: r.role, peerId: r.peerId });
  }
  return seats;
}

export function isSessionPlayMessage(data: unknown): data is SessionPlayMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_PLAY_TYPE) return false;
  if (m.v !== SESSION_PLAY_VERSION) return false;
  if (typeof m.op !== "string" || !PLAY_OPS.has(m.op as SessionPlayOp)) {
    return false;
  }
  if (!isId(m.from)) return false;
  if (m.op === "end") return true;
  if (!isCatalogId(m.catalogId)) return false;
  if (m.rev !== undefined) {
    if (typeof m.rev !== "string" || m.rev.length === 0 || m.rev.length > REV_MAX) {
      return false;
    }
  }
  if (m.sessionId !== undefined && !isId(m.sessionId)) return false;
  if (m.channelName !== undefined && !isId(m.channelName)) return false;
  return parseSeats(m.seats) !== null;
}

export function buildSessionPlayOffer(opts: {
  from: string;
  catalogId: string;
  rev?: string;
  seats: readonly SessionPlaySeat[];
  sessionId?: string;
  channelName?: string;
}): SessionPlayOfferMessage {
  const msg: SessionPlayOfferMessage = {
    type: SESSION_PLAY_TYPE,
    v: SESSION_PLAY_VERSION,
    op: "offer",
    from: opts.from,
    catalogId: opts.catalogId,
    seats: opts.seats.map((s) => ({ role: s.role, peerId: s.peerId })),
  };
  if (opts.rev) msg.rev = opts.rev;
  if (opts.sessionId) msg.sessionId = opts.sessionId;
  if (opts.channelName) msg.channelName = opts.channelName;
  return msg;
}

export function buildSessionPlayEnd(opts: {
  from: string;
}): SessionPlayEndMessage {
  return {
    type: SESSION_PLAY_TYPE,
    v: SESSION_PLAY_VERSION,
    op: "end",
    from: opts.from,
  };
}
