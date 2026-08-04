/**
 * Multi-session chat index for the agent starter (Durable KV).
 * Sessions are scoped per work project id.
 * Pure helpers — no fetch / DOM.
 */

/** Pre–per-project index (migrated into scoped keys on first load). */
export const LEGACY_SESSIONS_INDEX_KEY = "agent:sessions:index:v1";
/** Ultra-old single-blob session. */
export const LEGACY_SESSION_KEY = "agent:session:v1";

/** @deprecated use LEGACY_SESSIONS_INDEX_KEY */
export const SESSIONS_INDEX_KEY = LEGACY_SESSIONS_INDEX_KEY;

export interface AgentSessionMeta {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AgentSessionsIndex {
  currentId: string;
  sessions: AgentSessionMeta[];
}

export interface AgentSessionPayload {
  messages: unknown[];
  title?: string;
  updatedAt?: string;
}

export function sessionsIndexKey(workSandboxId: string): string {
  return `agent:sessions:${workSandboxId}:index:v1`;
}

export function sessionMessagesKey(
  workSandboxId: string,
  sessionId: string
): string {
  return `agent:session:${workSandboxId}:${sessionId}:v1`;
}

/** Unscoped multi-session message key (pre–per-project). */
export function legacySessionMessagesKey(sessionId: string): string {
  return `agent:session:${sessionId}:v1`;
}

export function createSessionId(now = Date.now()): string {
  return `s-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emptySessionsIndex(
  now = new Date().toISOString()
): AgentSessionsIndex {
  const id = createSessionId();
  return {
    currentId: id,
    sessions: [{ id, title: "新對話", updatedAt: now }],
  };
}

/** Derive a short title from the first user message. */
export function titleFromMessages(
  messages: Array<{ role?: string; content?: unknown }> | undefined,
  fallback = "新對話"
): string {
  if (!Array.isArray(messages)) return fallback;
  const user = messages.find(
    m => m?.role === "user" && typeof m.content === "string" && m.content.trim()
  );
  if (!user || typeof user.content !== "string") return fallback;
  const one = user.content.replace(/\s+/gu, " ").trim();
  if (!one) return fallback;
  return one.length > 28 ? `${one.slice(0, 28)}…` : one;
}

export function parseSessionsIndex(raw: unknown): AgentSessionsIndex | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { currentId?: unknown; sessions?: unknown };
  if (typeof o.currentId !== "string" || !o.currentId) return null;
  if (!Array.isArray(o.sessions) || o.sessions.length === 0) return null;
  const sessions: AgentSessionMeta[] = [];
  for (const s of o.sessions) {
    if (!s || typeof s !== "object") continue;
    const m = s as { id?: unknown; title?: unknown; updatedAt?: unknown };
    if (typeof m.id !== "string" || !m.id) continue;
    sessions.push({
      id: m.id,
      title: typeof m.title === "string" && m.title ? m.title : "對話",
      updatedAt:
        typeof m.updatedAt === "string" && m.updatedAt
          ? m.updatedAt
          : new Date(0).toISOString(),
    });
  }
  if (!sessions.length) return null;
  const currentId = sessions.some(s => s.id === o.currentId)
    ? o.currentId
    : sessions[0]!.id;
  return { currentId, sessions };
}

export function parseSessionPayload(raw: unknown): AgentSessionPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { messages?: unknown; title?: unknown; updatedAt?: unknown };
  if (!Array.isArray(o.messages)) return null;
  return {
    messages: o.messages,
    title: typeof o.title === "string" ? o.title : undefined,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : undefined,
  };
}

/**
 * If legacy single-session KV exists and index is missing, build an index
 * pointing at a new id whose messages should be the legacy payload.
 */
export function migrateLegacyToIndex(
  legacyRaw: string | null | undefined,
  now = new Date().toISOString()
): {
  index: AgentSessionsIndex;
  legacyMessages: unknown[] | null;
} | null {
  if (legacyRaw == null || legacyRaw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRaw);
  } catch {
    return null;
  }
  const payload = parseSessionPayload(parsed);
  const messages = payload?.messages ?? [];
  const id = createSessionId();
  const title = titleFromMessages(
    messages as Array<{ role?: string; content?: unknown }>,
    "先前對話"
  );
  return {
    index: {
      currentId: id,
      sessions: [{ id, title, updatedAt: now }],
    },
    legacyMessages: messages,
  };
}

export function upsertSessionMeta(
  index: AgentSessionsIndex,
  meta: AgentSessionMeta
): AgentSessionsIndex {
  const rest = index.sessions.filter(s => s.id !== meta.id);
  return {
    currentId: index.currentId,
    sessions: [meta, ...rest].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0
    ),
  };
}

export function removeSessionFromIndex(
  index: AgentSessionsIndex,
  id: string,
  now = new Date().toISOString()
): AgentSessionsIndex {
  const sessions = index.sessions.filter(s => s.id !== id);
  if (!sessions.length) {
    const fresh = emptySessionsIndex(now);
    return fresh;
  }
  const currentId = index.currentId === id ? sessions[0]!.id : index.currentId;
  return { currentId, sessions };
}
