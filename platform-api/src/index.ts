import {
  claimRegistrationInvite,
  deleteApiKey,
  deleteSecretMapping,
  ensureUser,
  getApiKeyForUser,
  getRegistrationInvite,
  getShortMapping,
  getUser,
  getUserIdByGithub,
  isBootstrapped,
  issueAccessToken,
  linkGithub,
  lookupAccessToken,
  lookupApiKey,
  markBootstrapped,
  markShortRevoked,
  parseBearer,
  putApiKey,
  putRegistrationInvite,
  putShortMapping,
  revokeAccessToken,
} from "./auth.js";
import {
  adminHtml,
  bootstrapHtml,
  htmlResponse,
  joinLandingHtml,
} from "./adminUi.js";
import { FAVICON_SVG } from "./faviconSvg.js";
import { withCors } from "./cors.js";
import {
  clearSessionCookieHeader,
  decodeOAuthState,
  encodeOAuthState,
  exchangeGithubCode,
  fetchGithubProfile,
  githubAuthorizeUrl,
  githubOAuthConfigured,
  oauthCallbackUri,
  readSessionCookie,
  sessionCookieHeader,
} from "./githubOAuth.js";
import {
  ACCESS_TOKEN_TTL_MS,
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
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
};

function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });
}

function parseAccessCredential(req: Request): string | null {
  return parseBearer(req) || readSessionCookie(req);
}

function inviteStub(env: Env, inviteId: string): DurableObjectStub {
  const id = env.INVITES.idFromName(inviteId);
  return env.INVITES.get(id);
}

/** Field shell: Invite / signal — API key only. */
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
  if (bearer.startsWith("pg_at_")) {
    return {
      ok: false,
      res: json(
        {
          error: "wrong_credential",
          message: "Field APIs require API key, not access token",
        },
        401
      ),
    };
  }
  const key = await lookupApiKey(env.STORE, bearer);
  if (!key) {
    return { ok: false, res: json({ error: "unauthorized" }, 401) };
  }
  return { ok: true, userId: key.userId, role: key.role };
}

/** Dashboard account APIs — access token only (Bearer or session cookie). */
async function requireAccessToken(
  env: Env,
  req: Request
): Promise<
  | { ok: true; userId: string; role: "admin" | "user"; bearer: string }
  | { ok: false; res: Response }
> {
  const bearer = parseAccessCredential(req);
  if (!bearer) {
    return { ok: false, res: json({ error: "unauthorized" }, 401) };
  }
  if (bearer.startsWith("pg_sk_")) {
    return {
      ok: false,
      res: json(
        {
          error: "wrong_credential",
          message:
            "Dashboard APIs require access token via GitHub SSO (not API key)",
        },
        401
      ),
    };
  }
  const at = await lookupAccessToken(env.STORE, bearer);
  if (!at) {
    return { ok: false, res: json({ error: "unauthorized" }, 401) };
  }
  const user = await getUser(env.STORE, at.userId);
  if (user?.disabled) {
    return { ok: false, res: json({ error: "forbidden" }, 403) };
  }
  return { ok: true, userId: at.userId, role: at.role, bearer };
}

function dashErrorRedirect(
  origin: string,
  code: string,
  path = "/"
): Response {
  const base = path.endsWith("/") ? path : `${path}/`;
  return Response.redirect(
    `${origin}${base}?auth_error=${encodeURIComponent(code)}`,
    302
  );
}

async function putSessionHandoff(
  env: Env,
  accessToken: string
): Promise<string> {
  const code = randomId(24);
  await env.STORE.put(
    `handoff:${code}`,
    accessToken,
    { expirationTtl: 120 }
  );
  return code;
}

async function dashSuccessRedirect(
  env: Env,
  request: Request,
  accessToken: string,
  expiresAt: number,
  extraQuery?: string
): Promise<Response> {
  const origin = new URL(request.url).origin;
  const maxAge = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000));
  const handoff = await putSessionHandoff(env, accessToken);
  const params = new URLSearchParams();
  params.set("session", handoff);
  if (extraQuery) {
    for (const part of extraQuery.split("&")) {
      const [k, v] = part.split("=");
      if (k) params.set(k, v ?? "1");
    }
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${origin}/?${params.toString()}`,
      "Set-Cookie": sessionCookieHeader(accessToken, maxAge, request),
    },
  });
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

  if (path === "/favicon.svg" || path === "/favicon.ico") {
    return new Response(FAVICON_SVG, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  if (isApi && (path === "/" || path === "/admin" || path === "/admin/")) {
    return Response.redirect(`${DASH_ORIGIN}/`, 302);
  }

  if (isApi && (path === "/bootstrap" || path === "/bootstrap/")) {
    return Response.redirect(`${DASH_ORIGIN}/bootstrap/`, 302);
  }

  if (
    (isDash || isLocal) &&
    (path === "/bootstrap" || path === "/bootstrap/")
  ) {
    return htmlResponse(bootstrapHtml());
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
          "註冊邀請有效。請使用 GitHub 領取：綁定帳號、建立後台 session，並取得一把場用 API key（寫入場內密鑰庫）。",
        expiresAt: inv.expiresAt,
        token,
      })
    );
  }

  if (request.method === "GET" && pathname === "/health") {
    return json({
      ok: true,
      service: "playgrounds-platform-api",
      github_oauth: githubOAuthConfigured(env),
    });
  }

  // —— GitHub OAuth ——
  if (request.method === "GET" && pathname === "/auth/github") {
    if (!githubOAuthConfigured(env)) {
      return json({ error: "github_oauth_not_configured" }, 503);
    }
    const intentParam = url.searchParams.get("intent") || "login";
    let intent;
    if (intentParam === "join") {
      const inviteToken = url.searchParams.get("token") || "";
      if (!inviteToken) return json({ error: "bad_request" }, 400);
      intent = { intent: "join" as const, inviteToken };
    } else if (intentParam === "link") {
      const auth = await requireAccessToken(env, request);
      if (!auth.ok) return auth.res;
      intent = { intent: "link" as const, userId: auth.userId };
    } else if (intentParam === "bootstrap") {
      const bootstrapToken =
        url.searchParams.get("bootstrap_token") ||
        url.searchParams.get("token") ||
        "";
      if (!bootstrapToken) return json({ error: "bad_request" }, 400);
      intent = { intent: "bootstrap" as const, bootstrapToken };
    } else {
      intent = { intent: "login" as const };
    }
    const state = await encodeOAuthState(env.OAUTH_STATE_SECRET!, intent);
    const redirectUri = oauthCallbackUri(request);
    const loc = githubAuthorizeUrl({
      clientId: env.GITHUB_CLIENT_ID!,
      redirectUri,
      state,
    });
    return Response.redirect(loc, 302);
  }

  if (request.method === "GET" && pathname === "/auth/github/callback") {
    const origin = new URL(request.url).origin;
    if (!githubOAuthConfigured(env)) {
      return dashErrorRedirect(origin, "github_oauth_not_configured");
    }
    const err = url.searchParams.get("error");
    if (err) return dashErrorRedirect(origin, err);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return dashErrorRedirect(origin, "missing_code");
    const state = await decodeOAuthState(env.OAUTH_STATE_SECRET!, stateRaw);
    if (!state) return dashErrorRedirect(origin, "invalid_state");

    const errPath = state.intent === "bootstrap" ? "/bootstrap/" : "/";
    const fail = (c: string) => dashErrorRedirect(origin, c, errPath);

    const redirectUri = oauthCallbackUri(request);
    const exchanged = await exchangeGithubCode({
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      code,
      redirectUri,
    });
    if ("error" in exchanged) {
      return fail("token_exchange_failed");
    }
    const profile = await fetchGithubProfile(exchanged.accessToken);
    if ("error" in profile) {
      return fail("github_user_failed");
    }

    if (state.intent === "login") {
      const userId = await getUserIdByGithub(env.STORE, profile.id);
      if (!userId) return fail("need_invite_or_link");
      const user = await getUser(env.STORE, userId);
      if (!user || user.disabled) return fail("forbidden");
      const at = await issueAccessToken(env.STORE, user.userId, user.role);
      return dashSuccessRedirect(
        env,
        request,
        at.plaintext,
        at.record.expiresAt
      );
    }

    if (state.intent === "link") {
      const linked = await linkGithub(env.STORE, state.userId, profile);
      if (!linked.ok) return fail(linked.error);
      const user = await getUser(env.STORE, state.userId);
      if (!user) return fail("user_not_found");
      const at = await issueAccessToken(env.STORE, user.userId, user.role);
      return dashSuccessRedirect(
        env,
        request,
        at.plaintext,
        at.record.expiresAt,
        "linked=1"
      );
    }

    if (state.intent === "bootstrap") {
      const expected = env.ADMIN_BOOTSTRAP_TOKEN;
      if (!expected || state.bootstrapToken !== expected) {
        return fail("unauthorized");
      }
      const userId = "admin";
      const already = await isBootstrapped(env.STORE);

      if (already) {
        await ensureUser(env.STORE, userId, "admin");
        const admin = await getUser(env.STORE, userId);
        if (!admin) return fail("user_not_found");
        const ghOwner = await getUserIdByGithub(env.STORE, profile.id);
        if (ghOwner && ghOwner !== userId) {
          return fail("github_already_linked");
        }
        if (admin.github && admin.github.id !== profile.id) {
          return fail("admin_github_mismatch");
        }
        if (!admin.github) {
          const linked = await linkGithub(env.STORE, userId, profile);
          if (!linked.ok) return fail(linked.error);
        }
        const at = await issueAccessToken(env.STORE, userId, "admin");
        return dashSuccessRedirect(
          env,
          request,
          at.plaintext,
          at.record.expiresAt,
          "linked=1"
        );
      }

      await ensureUser(env.STORE, userId, "admin");
      const plaintext = apiKeyPlaintext();
      await putApiKey(env.STORE, plaintext, userId, "admin");
      const linked = await linkGithub(env.STORE, userId, profile);
      if (!linked.ok) return fail(linked.error);
      await markBootstrapped(env.STORE);
      const at = await issueAccessToken(env.STORE, userId, "admin");
      await env.STORE.put(`reveal:user:${userId}`, plaintext, {
        expirationTtl: 600,
      });
      return dashSuccessRedirect(
        env,
        request,
        at.plaintext,
        at.record.expiresAt,
        "bootstrap=1"
      );
    }

    if (state.intent === "join") {
      const inv = await getRegistrationInvite(env.STORE, state.inviteToken);
      if (!inv) return fail("invite_not_found");
      if (Date.now() >= inv.expiresAt || inv.usedAt) {
        return fail("invite_gone");
      }
      const existingId = await getUserIdByGithub(env.STORE, profile.id);
      if (existingId) {
        const user = await getUser(env.STORE, existingId);
        if (!user || user.disabled) return fail("forbidden");
        const at = await issueAccessToken(env.STORE, user.userId, user.role);
        return dashSuccessRedirect(
          env,
          request,
          at.plaintext,
          at.record.expiresAt
        );
      }
      const claimed = await claimRegistrationInvite(
        env.STORE,
        state.inviteToken,
        "user"
      );
      if (!claimed.ok) {
        return fail(claimed.error);
      }
      const linked = await linkGithub(env.STORE, claimed.userId, profile);
      if (!linked.ok) return fail(linked.error);
      await env.STORE.put(`reveal:user:${claimed.userId}`, claimed.apiKey, {
        expirationTtl: 600,
      });
      return dashSuccessRedirect(
        env,
        request,
        claimed.accessToken,
        claimed.accessTokenExpiresAt,
        "claimed=1"
      );
    }

    return fail("unknown_intent");
  }

  // OAuth / cookie handoff → establish Bearer in browser
  if (request.method === "POST" && pathname === "/v1/auth/session") {
    const body = (await request.json().catch(() => ({}))) as {
      session?: string;
    };
    const code = body.session?.trim();
    if (!code) return json({ error: "bad_request" }, 400);
    const token = await env.STORE.get(`handoff:${code}`);
    if (!token) return json({ error: "unauthorized" }, 401);
    await env.STORE.delete(`handoff:${code}`);
    const at = await lookupAccessToken(env.STORE, token);
    if (!at) return json({ error: "unauthorized" }, 401);
    const maxAge = Math.max(
      60,
      Math.floor((at.expiresAt - Date.now()) / 1000)
    );
    return json(
      {
        access_token: token,
        expires_at: at.expiresAt,
        user_id: at.userId,
        role: at.role,
      },
      200,
      { "Set-Cookie": sessionCookieHeader(token, maxAge, request) }
    );
  }

  // One-time field API key reveal after SSO bootstrap/claim
  if (request.method === "POST" && pathname === "/v1/auth/reveal-key") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const raw = await env.STORE.get(`reveal:user:${auth.userId}`);
    if (!raw) return json({ error: "no_pending_reveal" }, 404);
    await env.STORE.delete(`reveal:user:${auth.userId}`);
    return json({
      api_key: raw,
      note: "Store in SecretStore PLAYGROUNDS_API_KEY. Shown once.",
    });
  }

  // Bootstrap → field API key + dashboard access token
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
    await ensureUser(env.STORE, userId, "admin");
    const plaintext = apiKeyPlaintext();
    await putApiKey(env.STORE, plaintext, userId, "admin");
    const at = await issueAccessToken(env.STORE, userId, "admin");
    await markBootstrapped(env.STORE);
    const maxAge = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);
    return json(
      {
        user_id: userId,
        role: "admin",
        api_key: plaintext,
        access_token: at.plaintext,
        expires_at: at.record.expiresAt,
        note: "Store api_key for the field shell (SecretStore). Dashboard uses access_token. Prefer GitHub bootstrap next time.",
      },
      200,
      { "Set-Cookie": sessionCookieHeader(at.plaintext, maxAge, request) }
    );
  }

  // Revoke current access token
  if (request.method === "POST" && pathname === "/v1/auth/logout") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) {
      return json(
        { ok: true },
        200,
        { "Set-Cookie": clearSessionCookieHeader(request) }
      );
    }
    await revokeAccessToken(env.STORE, auth.bearer);
    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearSessionCookieHeader(request) }
    );
  }

  // Session / me
  if (request.method === "GET" && pathname === "/v1/me") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const key = await getApiKeyForUser(env.STORE, auth.userId);
    const user = await getUser(env.STORE, auth.userId);
    return json({
      user_id: auth.userId,
      role: auth.role,
      github: user?.github
        ? { id: user.github.id, login: user.github.login }
        : null,
      key: key
        ? { prefix: key.prefix, created_at: key.createdAt }
        : null,
    });
  }

  // Rotate / create field API key — access token; session unchanged
  if (request.method === "POST" && pathname === "/v1/keys") {
    const auth = await requireAccessToken(env, request);
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
      note: "Previous field API key revoked. Store this key in SecretStore. Dashboard session unchanged.",
    });
  }

  // Revoke field API key — does not revoke access token
  if (request.method === "DELETE" && pathname === "/v1/keys") {
    const auth = await requireAccessToken(env, request);
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
    const auth = await requireAccessToken(env, request);
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

  // Claim registration invite → user + API key + access token
  const claimMatch = /^\/v1\/join\/([^/]+)\/claim$/.exec(pathname);
  if (request.method === "POST" && claimMatch) {
    const token = claimMatch[1]!;
    const claimed = await claimRegistrationInvite(env.STORE, token, "user");
    if (!claimed.ok) {
      return json({ error: claimed.error }, claimed.status);
    }
    return json(
      {
        user_id: claimed.userId,
        role: claimed.role,
        api_key: claimed.apiKey,
        access_token: claimed.accessToken,
        expires_at: claimed.accessTokenExpiresAt,
        note: "Store api_key for the field shell. Dashboard uses access_token.",
      },
      200,
      {
        "Set-Cookie": sessionCookieHeader(
          claimed.accessToken,
          Math.floor((claimed.accessTokenExpiresAt - Date.now()) / 1000),
          request
        ),
      }
    );
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
