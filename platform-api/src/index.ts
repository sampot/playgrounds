import {
  claimRegistrationInvite,
  deleteApiKey,
  deleteSecretMapping,
  getApiKeyForUser,
  getRegistrationInvite,
  getShortMapping,
  isBootstrapped,
  lookupApiKey,
  markBootstrapped,
  markShortRevoked,
  parseBearer,
  putApiKey,
  putRegistrationInvite,
  putShortMapping,
} from "./auth.js";
import {
  adminHtml,
  htmlResponse,
  joinLandingHtml,
} from "./adminUi.js";
import { withCors } from "./cors.js";
import {
  apiKeyPlaintext,
  DASH_ORIGIN,
  DEFAULT_TARGET_FIELD,
  fieldDeepLink,
  inviteSecret,
  INVITE_TTL_MS,
  isApiHost,
  isDashHost,
  randomId,
  requestHostname,
  shortId,
  shortLinkOrigin,
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

function serveDashboard(request: Request, url: URL): Response | null {
  const host = requestHostname(request);
  const path = url.pathname;
  const isDash = isDashHost(host);
  const isApi = isApiHost(host);
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".workers.dev");

  if (isApi && (path === "/" || path === "/admin" || path === "/admin/")) {
    return Response.redirect(`${DASH_ORIGIN}/`, 302);
  }

  if (
    (isDash || isLocal) &&
    (path === "/" || path === "/admin" || path === "/admin/")
  ) {
    return htmlResponse(adminHtml());
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return withCors(request, new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    if (request.method === "GET") {
      const dash = serveDashboard(request, url);
      if (dash) return dash;
    }

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
    if (map.revoked || Date.now() >= map.expiresAt) {
      return json({ error: "gone" }, 410);
    }
    const loc = fieldDeepLink(map.targetField, map.secret);
    return new Response(null, {
      status: 302,
      headers: { Location: loc },
    });
  }

  // Platform registration invite landing
  const joinMatchPath = /^\/join\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (request.method === "GET" && joinMatchPath) {
    const token = joinMatchPath[1]!;
    const inv = await getRegistrationInvite(env.STORE, token);
    if (!inv) {
      return htmlResponse(
        joinLandingHtml({
          ok: false,
          message: "這份註冊邀請不存在或無效。",
        }),
        404
      );
    }
    if (Date.now() >= inv.expiresAt) {
      return htmlResponse(
        joinLandingHtml({
          ok: false,
          message: "這份註冊邀請已過期。",
          expiresAt: inv.expiresAt,
        }),
        410
      );
    }
    if (inv.usedAt) {
      return htmlResponse(
        joinLandingHtml({
          ok: false,
          message: "這份註冊邀請已經使用過了。",
        }),
        410
      );
    }
    return htmlResponse(
      joinLandingHtml({
        ok: true,
        message:
          "註冊邀請有效。領取後會建立 Platform 帳號並發給一把 API key（不存密碼；Social SSO 為後續加強）。",
        expiresAt: inv.expiresAt,
        token,
      })
    );
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

  // Session / me
  if (request.method === "GET" && pathname === "/v1/me") {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const key = await getApiKeyForUser(env.STORE, auth.userId);
    return json({
      user_id: auth.userId,
      role: auth.role,
      key: key
        ? { prefix: key.prefix, created_at: key.createdAt }
        : null,
    });
  }

  // Rotate / create API key (hard cap 1)
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

  // Revoke API key
  if (request.method === "DELETE" && pathname === "/v1/keys") {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const ok = await deleteApiKey(env.STORE, auth.userId);
    if (!ok) return json({ error: "no_key" }, 404);
    return json({ ok: true });
  }

  // Admin: registration invites
  if (
    request.method === "POST" &&
    pathname === "/v1/admin/registration-invites"
  ) {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    if (auth.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }
    const body = (await request.json().catch(() => ({}))) as {
      ttlMs?: number;
    };
    const ttlMs =
      body.ttlMs && body.ttlMs > 0 ? body.ttlMs : 7 * 24 * 60 * 60 * 1000;
    const token = randomId(18);
    const createdAt = Date.now();
    const expiresAt = createdAt + ttlMs;
    await putRegistrationInvite(env.STORE, {
      token,
      createdBy: auth.userId,
      createdAt,
      expiresAt,
      usedAt: null,
    });
    const origin = isDashHost(requestHostname(request)) ||
      isApiHost(requestHostname(request))
      ? DASH_ORIGIN
      : url.origin;
    return json({
      token,
      join_url: `${origin}/join/${token}`,
      expires_at: expiresAt,
    });
  }

  // Claim registration invite → user + API key (no password; SSO later)
  const claimMatch = /^\/v1\/join\/([^/]+)\/claim$/.exec(pathname);
  if (request.method === "POST" && claimMatch) {
    const token = claimMatch[1]!;
    const claimed = await claimRegistrationInvite(env.STORE, token, "user");
    if (!claimed.ok) {
      return json({ error: claimed.error }, claimed.status);
    }
    return json({
      user_id: claimed.userId,
      role: claimed.role,
      api_key: claimed.apiKey,
      note: "Store this key now; it will not be shown again.",
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
    const origin = shortLinkOrigin(request);
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
    const metaRes = await stub.fetch("https://invite/meta");
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        shortId?: string;
        secret?: string;
        ownerUserId?: string;
      };
      if (meta.ownerUserId && meta.ownerUserId !== auth.userId) {
        return json({ error: "forbidden" }, 403);
      }
      if (meta.shortId) await markShortRevoked(env.STORE, meta.shortId);
      if (meta.secret) await deleteSecretMapping(env.STORE, meta.secret);
    }
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
