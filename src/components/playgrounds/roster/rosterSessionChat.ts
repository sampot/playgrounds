/**
 * Session-scoped peer chat over Roster DataChannel (independent top-level type).
 * Shared by play + go shells — go ⊂ play contract.
 */

export const SESSION_CHAT_TYPE = "session_chat" as const;
export const SESSION_CHAT_VERSION = 1 as const;
/** Max Unicode code points per message (hard reject if over). */
export const SESSION_CHAT_MAX_TEXT_CHARS = 200;
/** Local timeline cap (merged, not per-peer). */
export const SESSION_CHAT_MAX_TIMELINE = 50;
/** Toast shows full text up to this many code points. */
export const SESSION_CHAT_TOAST_FULL_CHARS = 40;

/** Optional seat role on the wire — Host messages get a distinct UI mark. */
export type SessionChatRole = "host" | "guest";

/** Default Host display name in chat／presence (not "玩家 A"). */
export const SESSION_CHAT_HOST_DISPLAY_NAME = "主持" as const;

export type SessionChatMsg = {
  type: typeof SESSION_CHAT_TYPE;
  id: string;
  from: string;
  name?: string;
  /** When `"host"`, shells show a Host badge. Omitted＝guest／unknown. */
  role?: SessionChatRole;
  text: string;
  ts: number;
  v: typeof SESSION_CHAT_VERSION;
};

/** SAM → shell hints; missing fields = defaults. */
export type SessionChatHints = {
  /** During session `active` only; default true. */
  freeText?: boolean;
  quickReplies?: string[];
};

export type SessionChatSendTarget = {
  send: (data: unknown) => void;
};

export type SessionChatUiPhase =
  | "waiting"
  | "ready"
  | "active"
  | "ended"
  | string;

function codePointLength(s: string): number {
  return [...s].length;
}

function codePointSlice(s: string, max: number): string {
  return [...s].slice(0, max).join("");
}

/** Trim; null if blank or over {@link SESSION_CHAT_MAX_TEXT_CHARS}. */
export function normalizeSessionChatText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (codePointLength(text) > SESSION_CHAT_MAX_TEXT_CHARS) return null;
  return text;
}

export function isSessionChatMessage(data: unknown): data is SessionChatMsg {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_CHAT_TYPE) return false;
  if (m.v !== SESSION_CHAT_VERSION) return false;
  if (typeof m.id !== "string" || !m.id) return false;
  if (typeof m.from !== "string" || !m.from) return false;
  if (typeof m.text !== "string" || !m.text) return false;
  if (typeof m.ts !== "number" || !Number.isFinite(m.ts)) return false;
  if (m.name !== undefined && typeof m.name !== "string") return false;
  if (
    m.role !== undefined &&
    m.role !== "host" &&
    m.role !== "guest"
  ) {
    return false;
  }
  if (codePointLength(m.text) > SESSION_CHAT_MAX_TEXT_CHARS) return false;
  return true;
}

/** True when the message is from session Host (wire role or legacy name). */
export function isSessionChatHostMessage(msg: SessionChatMsg): boolean {
  if (msg.role === "host") return true;
  const n = msg.name?.trim();
  return n === SESSION_CHAT_HOST_DISPLAY_NAME;
}

function newChatId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildSessionChatMessage(opts: {
  from: string;
  text: string;
  name?: string;
  role?: SessionChatRole;
  id?: string;
  ts?: number;
}): SessionChatMsg | null {
  const text = normalizeSessionChatText(opts.text);
  if (!text) return null;
  if (!opts.from) return null;
  const msg: SessionChatMsg = {
    type: SESSION_CHAT_TYPE,
    id: opts.id || newChatId(),
    from: opts.from,
    text,
    ts: opts.ts ?? Date.now(),
    v: SESSION_CHAT_VERSION,
  };
  if (opts.name !== undefined && opts.name !== "") {
    msg.name = opts.name;
  }
  if (opts.role === "host" || opts.role === "guest") {
    msg.role = opts.role;
  }
  return msg;
}

/**
 * Fanout: same payload to every peer. Returns how many sends succeeded.
 * API is broadcast-shaped even when there is only one peer (P0).
 */
export function broadcastSessionChat(
  peers: readonly SessionChatSendTarget[],
  msg: SessionChatMsg
): number {
  let ok = 0;
  for (const peer of peers) {
    try {
      peer.send(msg);
      ok += 1;
    } catch {
      /* channel closed — skip */
    }
  }
  return ok;
}

export function formatSessionChatToast(msg: SessionChatMsg): string {
  const who = isSessionChatHostMessage(msg)
    ? SESSION_CHAT_HOST_DISPLAY_NAME
    : (msg.name && msg.name.trim()) || "對手";
  const body =
    codePointLength(msg.text) <= SESSION_CHAT_TOAST_FULL_CHARS
      ? msg.text
      : `${codePointSlice(msg.text, SESSION_CHAT_TOAST_FULL_CHARS)}……`;
  return `${who}：${body}`;
}

/**
 * Free-text input: default allow. `freeText: false` only while `active`.
 */
export function resolveSessionChatFreeText(
  hints: SessionChatHints | undefined | null,
  phase: SessionChatUiPhase
): boolean {
  if (hints?.freeText === false && phase === "active") return false;
  return true;
}

/** Shell defaults when SAM does not override `quickReplies`. */
export const SESSION_CHAT_DEFAULT_QUICK_REPLIES: readonly string[] = [
  "加油",
  "等一下",
  "好棋",
  "再來",
  "GG",
];

const QUICK_REPLY_MAX = 8;

/**
 * `quickReplies` undefined → shell defaults；`[]` → none；非空 → 覆寫預設。
 */
export function resolveSessionChatQuickReplies(
  hints: SessionChatHints | undefined | null
): string[] {
  if (!hints || hints.quickReplies === undefined) {
    return [...SESSION_CHAT_DEFAULT_QUICK_REPLIES];
  }
  return hints.quickReplies
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, QUICK_REPLY_MAX);
}

/** SAM iframe → parent shell (play／go 同約). */
export const SESSION_CHAT_HINTS_TYPE = "playgrounds-session-chat-hints" as const;

export function normalizeSessionChatHints(
  raw: Record<string, unknown>
): SessionChatHints {
  const nested = raw.hints;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return normalizeSessionChatHints(nested as Record<string, unknown>);
  }
  const out: SessionChatHints = {};
  if (typeof raw.freeText === "boolean") out.freeText = raw.freeText;
  if (Array.isArray(raw.quickReplies)) {
    out.quickReplies = raw.quickReplies
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, QUICK_REPLY_MAX);
  }
  return out;
}

/** Parse parent `message` event data; null if not a hints envelope. */
export function parseSessionChatHintsMessage(
  data: unknown
): SessionChatHints | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_CHAT_HINTS_TYPE) return null;
  return normalizeSessionChatHints(m);
}

/**
 * Best-effort: pull session status out of a domain event for shell uiPhase.
 * Supports `{ status }` or `{ state: { status } }`.
 */
export function sessionChatPhaseFromEvent(
  event: unknown
): SessionChatUiPhase | null {
  if (!event || typeof event !== "object") return null;
  const o = event as Record<string, unknown>;
  const state = o.state;
  const statusRaw =
    state && typeof state === "object"
      ? (state as { status?: unknown }).status
      : o.status;
  const status = typeof statusRaw === "string" ? statusRaw : "";
  if (
    status === "active" ||
    status === "waiting" ||
    status === "ready" ||
    status === "ended"
  ) {
    return status;
  }
  return null;
}

/** Keep newest {@link SESSION_CHAT_MAX_TIMELINE} entries. */
export function trimSessionChatTimeline<T>(entries: T[]): T[] {
  if (entries.length <= SESSION_CHAT_MAX_TIMELINE) return entries;
  return entries.slice(entries.length - SESSION_CHAT_MAX_TIMELINE);
}
