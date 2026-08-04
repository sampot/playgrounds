/**
 * Brainstorm Host session API (dogfood for DEC-023).
 * Used by unit tests and kept aligned with sessionHostStarter functions.js
 * (OPFS template must be self-contained; see BRAINSTORM_FUNCTIONS_JS).
 */

import type { MockKvNamespace } from "./mockKv";

export const BRAINSTORM_PROTOCOL_ID = "brainstorm.v1";
export const BRAINSTORM_PROTOCOL_API_VERSION = "1";
export const BRAINSTORM_STATE_KEY = "session:brainstorm:v1";
/** Session permission classes (not agent persona labels). */
export const BRAINSTORM_ROLES = ["human", "participant"] as const;
export const BRAINSTORM_ROLE_LIMITS: Record<
  (typeof BRAINSTORM_ROLES)[number],
  number
> = {
  human: 1,
  participant: 4,
};

export interface BrainstormSessionEnv {
  KV: MockKvNamespace;
}

interface BrainstormStore {
  sessionId: string | null;
  channelName: string | null;
  seq: number;
  items: { id: string; role: string; text: string }[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function err(code: string, error: string, status = 400): Response {
  return json({ error, code }, status);
}

async function loadStore(env: BrainstormSessionEnv): Promise<BrainstormStore> {
  const raw = await env.KV.get(BRAINSTORM_STATE_KEY, "text");
  if (typeof raw !== "string" || !raw) {
    return { sessionId: null, channelName: null, seq: 0, items: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BrainstormStore>;
    return {
      sessionId: parsed.sessionId || null,
      channelName: parsed.channelName || null,
      seq: Number(parsed.seq) || 0,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch {
    return { sessionId: null, channelName: null, seq: 0, items: [] };
  }
}

async function saveStore(
  env: BrainstormSessionEnv,
  store: BrainstormStore
): Promise<void> {
  await env.KV.put(BRAINSTORM_STATE_KEY, JSON.stringify(store));
}

/** Workers-shaped fetch for brainstorm Host SAM (testable; KV-backed). */
export async function brainstormSessionFetch(
  request: Request,
  env: BrainstormSessionEnv
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (path.endsWith("/api/session/meta") && request.method === "GET") {
    return json({
      protocolId: BRAINSTORM_PROTOCOL_ID,
      apiVersion: BRAINSTORM_PROTOCOL_API_VERSION,
      roles: [...BRAINSTORM_ROLES],
      roleLimits: { ...BRAINSTORM_ROLE_LIMITS },
    });
  }

  if (path.endsWith("/api/session/open") && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
      channelName?: string;
    };
    const store: BrainstormStore = {
      sessionId: String(body.sessionId || ""),
      channelName: String(body.channelName || ""),
      seq: 0,
      items: [],
    };
    await saveStore(env, store);
    return json({
      ok: true,
      sessionId: store.sessionId,
      channelName: store.channelName,
    });
  }

  if (path.endsWith("/api/session/state") && request.method === "GET") {
    const store = await loadStore(env);
    return json({
      items: store.items,
      seq: store.seq,
      sessionId: store.sessionId,
      channelName: store.channelName,
      protocolId: BRAINSTORM_PROTOCOL_ID,
      apiVersion: BRAINSTORM_PROTOCOL_API_VERSION,
    });
  }

  if (path.endsWith("/api/session/act") && request.method === "POST") {
    const store = await loadStore(env);
    if (!store.sessionId) {
      return err("session_inactive", "通道尚未開啟（請先開始這一場）", 409);
    }
    const body = (await request.json().catch(() => null)) as {
      role?: string;
      payload?: { text?: string };
    } | null;
    if (!body || typeof body !== "object") {
      return err("act_rejected", "無效 body");
    }
    const role = String(body.role || "");
    if (!(BRAINSTORM_ROLES as readonly string[]).includes(role)) {
      return err("role_forbidden", "role 不允許");
    }
    const text = String(body.payload?.text || "").trim();
    if (!text) {
      return err("act_rejected", "需要 payload.text");
    }
    if (text.length > 500) {
      return err("act_rejected", "文字過長");
    }
    const item = {
      id: `i-${Math.random().toString(36).slice(2, 9)}`,
      role,
      text,
    };
    store.items.push(item);
    store.seq += 1;
    await saveStore(env, store);
    const event = { type: "item_added", item, seq: store.seq };
    return json({
      ok: true,
      events: [event],
      state: { items: store.items, seq: store.seq },
      seq: store.seq,
      sessionId: store.sessionId,
      channelName: store.channelName,
    });
  }

  return err("not_found", "找不到路由", 404);
}
