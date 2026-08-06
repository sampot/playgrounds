import {
  getShortMapping,
  isBootstrapped,
  lookupApiKey,
  markBootstrapped,
  parseBearer,
  putApiKey,
  putShortMapping,
} from "./auth.js";
import { withCors } from "./cors.js";
import {
  apiKeyPlaintext,
  DEFAULT_TARGET_FIELD,
  fieldDeepLink,
  inviteSecret,
  INVITE_TTL_MS,
  randomId,
  shortId,
  shortUrl,
} from "./ids.js";
import { InviteDurableObject } from "./inviteDo.js";

export { InviteDurableObject };

export type Env = {
  STORE: KVNamespace;
  INVITES: DurableObjectNamespace;
  ADMIN_BOOTSTRAP_TOKEN?: string;
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function inviteStub(env: Env, inviteId: string): DurableObjectStub {
  const id = env.INVITES.idFromName(inviteId);
  return env.INVITES.get(id);
}

function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  return url.origin;
}

async function requireApiKey(
  env: Env,
  req: Request
): Promise<
  | { ok: true; userId: string; role: "admin" | "user" }
  | { ok: false; res: Response }
> {
  const bearer = parseBearer(req);
  if (!bearer) {
    return { ok: false, res: json({ error: "unauthorized" }, 401) };
  }
  const key = await lookupApiKey(env.STORE, bearer);
  if (!key) {
    return { ok: false, res: json({ error: "unauthorized" }, 401) };
  }
  return { ok: true, userId: key.userId, role: key.role };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    let res: Response;
    try {
      res = await route(request, env, url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res = json({ error: "internal", message: msg }, 500);
    }
    return withCors(request, res);
  },
};

async function route(
  request: Request,
  env: Env,
  url: URL
): Promise<Response> {
  const { pathname } = url;

  // Short link
  const shortMatch = /^\/i\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (request.method === "GET" && shortMatch) {
    const id = shortMatch[1]!;
    const map = await getShortMapping(env.STORE, id);
    if (!map) return json({ error: "not_found" }, 404);
    if (Date.now() >= map.expiresAt) {
      return json({ error: "gone" }, 410);
    }
    const loc = fieldDeepLink(map.targetField, map.secret);
    return new Response(null, {
      status: 302,
      headers: { Location: loc },
    });
  }

  if (request.method === "GET" && pathname === "/health") {
    return json({ ok: true, service: "playgrounds-platform-api" });
  }

  // Bootstrap
  if (request.method === "POST" && pathname === "/v1/admin/bootstrap") {
    if (await isBootstrapped(env.STORE)) {
      return json({ error: "bootstrap_already_done" }, 410);
    }
    const expected = env.ADMIN_BOOTSTRAP_TOKEN;
    if (!expected) {
      return json({ error: "bootstrap_not_configured" }, 503);
    }
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
    };
    const token =
      body.token ||
      request.headers.get("X-Bootstrap-Token") ||
      parseBearer(request);
    if (!token || token !== expected) {
      return json({ error: "unauthorized" }, 401);
    }
    const userId = "admin";
    const plaintext = apiKeyPlaintext();
    await putApiKey(env.STORE, plaintext, userId, "admin");
    await markBootstrapped(env.STORE);
    return json({
      user_id: userId,
      role: "admin",
      api_key: plaintext,
      note: "Store this key now; it will not be shown again.",
    });
  }

  // Rotate API key (hard cap 1)
  if (request.method === "POST" && pathname === "/v1/keys") {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const plaintext = apiKeyPlaintext();
    const record = await putApiKey(
      env.STORE,
      plaintext,
      auth.userId,
      auth.role
    );
    return json({
      api_key: plaintext,
      prefix: record.prefix,
      created_at: record.createdAt,
      note: "Previous key revoked. Store this key now.",
    });
  }

  // Create invite
  if (request.method === "POST" && pathname === "/v1/invites") {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const body = (await request.json()) as {
      kind?: string;
      intent?: unknown;
      targetField?: string;
      ttlMs?: number;
    };
    const kind = body.kind || "signal.handshake";
    const intent = body.intent ?? {};
    const targetField = body.targetField || DEFAULT_TARGET_FIELD;
    const ttlMs = body.ttlMs && body.ttlMs > 0 ? body.ttlMs : INVITE_TTL_MS;
    const inviteId = randomId(16);
    const secret = inviteSecret();
    const sid = shortId();
    const stub = inviteStub(env, inviteId);
    const createRes = await stub.fetch("https://invite/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteId,
        secret,
        shortId: sid,
        ownerUserId: auth.userId,
        kind,
        intent,
        targetField,
        ttlMs,
      }),
    });
    if (!createRes.ok) {
      return json({ error: "create_failed" }, 500);
    }
    const created = (await createRes.json()) as { expiresAt: number };
    await putShortMapping(
      env.STORE,
      sid,
      inviteId,
      secret,
      targetField,
      created.expiresAt
    );
    await env.STORE.put(`secret:${secret}`, inviteId);
    const origin = publicOrigin(request);
    return json({
      invite_id: inviteId,
      kind,
      expires_at: created.expiresAt,
      short_url: shortUrl(origin, sid),
      deep_link: fieldDeepLink(targetField, secret),
      secret,
    });
  }

  // Preview invite by secret
  const previewMatch = /^\/v1\/invites\/([^/]+)$/.exec(pathname);
  if (request.method === "GET" && previewMatch) {
    const secret = decodeURIComponent(previewMatch[1]!);
    const inviteId = await findInviteIdBySecret(env, secret);
    if (!inviteId) return json({ error: "not_found" }, 404);
    const stub = inviteStub(env, inviteId);
    return stub.fetch("https://invite/meta");
  }

  // Join
  const joinMatch = /^\/v1\/invites\/([^/]+)\/joins$/.exec(pathname);
  if (request.method === "POST" && joinMatch) {
    const secret = decodeURIComponent(joinMatch[1]!);
    const inviteId = await findInviteIdBySecret(env, secret);
    if (!inviteId) return json({ error: "not_found" }, 404);
    const stub = inviteStub(env, inviteId);
    return stub.fetch("https://invite/joins", { method: "POST" });
  }

  // Offer (joiner)
  const offerMatch = /^\/v1\/invites\/([^/]+)\/signal\/offer$/.exec(
    pathname
  );
  if (request.method === "POST" && offerMatch) {
    const inviteId = decodeURIComponent(offerMatch[1]!);
    const authJoin = parseBearer(request);
    const body = (await request.json()) as {
      offer?: string;
      offerWire?: string;
      waitMs?: number;
    };
    const offerWire = body.offer ?? body.offerWire;
    if (!authJoin || !offerWire) {
      return json({ error: "bad_request" }, 400);
    }
    const stub = inviteStub(env, inviteId);
    return stub.fetch("https://invite/signal/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joinCap: authJoin,
        offerWire,
        waitMs: body.waitMs,
      }),
    });
  }

  // Pending (host)
  const pendingMatch = /^\/v1\/invites\/([^/]+)\/signal\/pending$/.exec(
    pathname
  );
  if (request.method === "GET" && pendingMatch) {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const inviteId = decodeURIComponent(pendingMatch[1]!);
    const waitMs = url.searchParams.get("waitMs");
    const stub = inviteStub(env, inviteId);
    const q = new URLSearchParams({ ownerUserId: auth.userId });
    if (waitMs) q.set("waitMs", waitMs);
    return stub.fetch(`https://invite/signal/pending?${q}`);
  }

  // Answer (host)
  const answerMatch = /^\/v1\/invites\/([^/]+)\/signal\/answer$/.exec(
    pathname
  );
  if (request.method === "PUT" && answerMatch) {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const inviteId = decodeURIComponent(answerMatch[1]!);
    const body = (await request.json()) as {
      answer?: string;
      answerWire?: string;
    };
    const answerWire = body.answer ?? body.answerWire;
    if (!answerWire) return json({ error: "bad_request" }, 400);
    const stub = inviteStub(env, inviteId);
    return stub.fetch("https://invite/signal/answer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerUserId: auth.userId,
        answerWire,
      }),
    });
  }

  // Delete invite
  const delMatch = /^\/v1\/invites\/([^/]+)$/.exec(pathname);
  if (request.method === "DELETE" && delMatch) {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const inviteId = decodeURIComponent(delMatch[1]!);
    const stub = inviteStub(env, inviteId);
    return stub.fetch(
      `https://invite/?ownerUserId=${encodeURIComponent(auth.userId)}`,
      { method: "DELETE" }
    );
  }

  return json({ error: "not_found" }, 404);
}

async function findInviteIdBySecret(
  env: Env,
  secret: string
): Promise<string | null> {
  return env.STORE.get(`secret:${secret}`);
}
