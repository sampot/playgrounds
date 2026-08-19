/**
 * 包廂文字互動：反應、飄浮表情、電視字幕、刪除、禁言、全員禁言。
 * JSON only — never media bytes. Hub star: Host fans out; guests may send react／float.
 */

import { normalizeSessionChatText } from "./rosterSessionChat";

export const SESSION_CHAT_CTL_TYPE = "session_chat_ctl" as const;
export const SESSION_CHAT_CTL_VERSION = 1 as const;

export const SESSION_CHAT_FLOAT_EMOJIS = [
  "👍",
  "❤️",
  "👏",
  "🎉",
  "😂",
] as const;

export type SessionChatFloatEmoji = (typeof SESSION_CHAT_FLOAT_EMOJIS)[number];

export const SESSION_CHAT_CAPTION_MS = 3000;
export const SESSION_CHAT_FLOAT_MS = 2200;
export const SESSION_CHAT_SILENCE_MS = 5 * 60 * 1000;

export type SessionChatCtlOp =
  | "react"
  | "float"
  | "caption"
  | "delete"
  | "silence"
  | "unsilence"
  | "lock"
  | "unlock";

export type SessionChatCtlMessage = {
  type: typeof SESSION_CHAT_CTL_TYPE;
  v: typeof SESSION_CHAT_CTL_VERSION;
  op: SessionChatCtlOp;
  from: string;
  id: string;
  targetId?: string;
  emoji?: SessionChatFloatEmoji;
  text?: string;
  to?: string;
  until?: number;
};

export type ChatReactionMap = Record<string, Record<string, string[]>>;

const CTL_OPS = new Set<SessionChatCtlOp>([
  "react",
  "float",
  "caption",
  "delete",
  "silence",
  "unsilence",
  "lock",
  "unlock",
]);
const EMOJI_SET = new Set<string>(SESSION_CHAT_FLOAT_EMOJIS);
const GUEST_OPS = new Set<SessionChatCtlOp>(["react", "float"]);
const ID_MAX = 128;

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

function isEmoji(value: unknown): value is SessionChatFloatEmoji {
  return typeof value === "string" && EMOJI_SET.has(value);
}

function newCtlId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ctl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isSessionChatCtlMessage(
  data: unknown
): data is SessionChatCtlMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_CHAT_CTL_TYPE) return false;
  if (m.v !== SESSION_CHAT_CTL_VERSION) return false;
  if (typeof m.op !== "string" || !CTL_OPS.has(m.op as SessionChatCtlOp)) {
    return false;
  }
  if (!isId(m.from) || !isId(m.id)) return false;
  const op = m.op as SessionChatCtlOp;
  if (op === "react") return isId(m.targetId) && isEmoji(m.emoji);
  if (op === "float") return isEmoji(m.emoji);
  if (op === "caption") {
    return typeof m.text === "string" && Boolean(normalizeSessionChatText(m.text));
  }
  if (op === "delete") return isId(m.targetId);
  if (op === "silence" || op === "unsilence") return isId(m.to);
  if (m.until !== undefined) {
    if (typeof m.until !== "number" || !Number.isFinite(m.until)) return false;
  }
  return op === "lock" || op === "unlock" || op === "silence" || op === "unsilence";
}

export function sessionChatCtlAllowedFromGuest(
  msg: SessionChatCtlMessage
): boolean {
  return GUEST_OPS.has(msg.op);
}

export function buildSessionChatCtlMessage(opts: {
  op: SessionChatCtlOp;
  from: string;
  id?: string;
  targetId?: string;
  emoji?: string;
  text?: string;
  to?: string;
  until?: number;
}): SessionChatCtlMessage {
  const msg: SessionChatCtlMessage = {
    type: SESSION_CHAT_CTL_TYPE,
    v: SESSION_CHAT_CTL_VERSION,
    op: opts.op,
    from: opts.from,
    id: opts.id || newCtlId(),
  };
  if (opts.targetId) msg.targetId = opts.targetId;
  if (isEmoji(opts.emoji)) msg.emoji = opts.emoji;
  const text = opts.text !== undefined ? normalizeSessionChatText(opts.text) : null;
  if (text) msg.text = text;
  if (opts.to) msg.to = opts.to;
  if (opts.until !== undefined) msg.until = opts.until;
  return msg;
}

export function applyChatReaction(
  map: ChatReactionMap,
  opts: { targetId: string; emoji: string; from: string }
): ChatReactionMap {
  const { targetId, emoji, from } = opts;
  if (!targetId || !isEmoji(emoji) || !from) return map;
  const byEmoji = { ...(map[targetId] ?? {}) };
  const who = [...(byEmoji[emoji] ?? [])];
  const at = who.indexOf(from);
  if (at >= 0) who.splice(at, 1);
  else who.push(from);
  if (who.length === 0) delete byEmoji[emoji];
  else byEmoji[emoji] = who;
  const next = { ...map };
  if (Object.keys(byEmoji).length === 0) delete next[targetId];
  else next[targetId] = byEmoji;
  return next;
}

export function chatReactionRows(
  map: ChatReactionMap,
  targetId: string,
  localId?: string | null
): { emoji: string; count: number; mine: boolean }[] {
  const byEmoji = map[targetId];
  if (!byEmoji) return [];
  const rows: { emoji: string; count: number; mine: boolean }[] = [];
  for (const emoji of SESSION_CHAT_FLOAT_EMOJIS) {
    const who = byEmoji[emoji];
    if (!who?.length) continue;
    rows.push({
      emoji,
      count: who.length,
      mine: Boolean(localId && who.includes(localId)),
    });
  }
  return rows;
}
