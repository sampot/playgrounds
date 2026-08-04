/**
 * chatSessionId ↔ multi-agent session binding helpers (DEC-033 §2.1).
 * Pure logic + KV key; persistence is caller-owned (work-sandbox Durable KV).
 */

import { CODING_ORCH_PROTOCOL_ID } from "./codingOrchestrationApi";

/** Work-sandbox KV key for the active coding-orchestration bind. */
export const CODING_ORCH_BIND_KEY = "coding:orch:bind:v1";

export interface CodingOrchBind {
  chatSessionId: string;
  sessionId: string;
  channelName: string;
  protocolId: string;
}

export type CodingOrchEnsureAction = "reuse" | "open" | "reopen";

/**
 * Decide whether the current multi-agent channel matches this chat.
 * - reuse: same chat already bound to an open session
 * - reopen: channel open but for another chat (or stale bind) → close then open
 * - open: no active channel
 */
export function codingOrchEnsureAction(opts: {
  chatSessionId: string;
  activeSessionId: string | null;
  bind: CodingOrchBind | null;
}): CodingOrchEnsureAction {
  const chat = opts.chatSessionId.trim();
  if (!chat) return "open";
  if (!opts.activeSessionId) return "open";
  if (
    opts.bind &&
    opts.bind.chatSessionId === chat &&
    opts.bind.sessionId === opts.activeSessionId &&
    opts.bind.protocolId === CODING_ORCH_PROTOCOL_ID
  ) {
    return "reuse";
  }
  return "reopen";
}

export function parseCodingOrchBind(raw: unknown): CodingOrchBind | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<CodingOrchBind>;
    if (
      typeof o.chatSessionId !== "string" ||
      !o.chatSessionId.trim() ||
      typeof o.sessionId !== "string" ||
      !o.sessionId.trim() ||
      typeof o.channelName !== "string" ||
      !o.channelName.trim()
    ) {
      return null;
    }
    return {
      chatSessionId: o.chatSessionId.trim(),
      sessionId: o.sessionId.trim(),
      channelName: o.channelName.trim(),
      protocolId:
        typeof o.protocolId === "string" && o.protocolId.trim()
          ? o.protocolId.trim()
          : CODING_ORCH_PROTOCOL_ID,
    };
  } catch {
    return null;
  }
}

export function serializeCodingOrchBind(bind: CodingOrchBind): string {
  return JSON.stringify({
    chatSessionId: bind.chatSessionId,
    sessionId: bind.sessionId,
    channelName: bind.channelName,
    protocolId: bind.protocolId || CODING_ORCH_PROTOCOL_ID,
  });
}
