import {
  claimRegistrationInvite,
  createFieldProvision,
  deleteApiKey,
  deleteSecretMapping,
  deleteUserAccount,
  ensureUser,
  getApiKeyForUser,
  getRegistrationInvite,
  getShortMapping,
  getUser,
  isBootstrapped,
  issueAccessToken,
  listUsers,
  lookupAccessToken,
  lookupApiKey,
  markBootstrapped,
  markShortRevoked,
  parseBearer,
  putApiKey,
  putRegistrationInvite,
  putShortMapping,
  putUser,
  redeemFieldProvision,
  revokeAccessToken,
  setUserDisabled,
  unlinkGithub,
  unlinkGoogle,
} from "./auth.js";
import {
  addCredits,
  debitTurnCredentials,
  listCreditSessions,
  setTurnHosted,
  setTurnPrefer,
  userCredits,
  userTurnHosted,
  userTurnPrefer,
} from "./credits.js";
import { generateCloudflareIceServers, turnConfigured } from "./turn.js";
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
  type OAuthIntent,
} from "./githubOAuth.js";
import {
  exchangeGoogleCode,
  fetchGoogleProfile,
  googleAuthorizeUrl,
  googleOAuthConfigured,
} from "./googleOAuth.js";
import { completeSsoIntent } from "./ssoFlow.js";
import {
  ACCESS_TOKEN_TTL_MS,
  apiKeyPlaintext,
  DASH_ORIGIN,
  DEFAULT_TARGET_FIELD,
  defaultFieldOriginOrFallback,
  fieldDeepLink,
  fieldProvisionDeepLink,
  inviteSecret,
  INVITE_TTL_MS,
  isApiHost,
  isDashHost,
  normalizeFieldOrigin,
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
  ASSETS?: Fetcher;
  ADMIN_BOOTSTRAP_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
  /** Cloudflare Realtime TURN key id (not secret). */
  TURN_KEY_ID?: string;
  /** Cloudflare Realtime TURN API token (secret). */
  TURN_API_TOKEN?: string;
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

async function mintTurnIceServers(
  env: Env,
  ownerUserId: string,
  sessionId?: string
): Promise<Response> {
  if (!turnConfigured(env)) {
    return json({ error: "turn_unavailable" }, 503);
  }
  const debit = await debitTurnCredentials(env.STORE, ownerUserId, sessionId);
  if (!debit.ok) {
    const status =
        debit.error === "credits_insufficient"
        ? 402
        : debit.error === "turn_not_entitled" ||
            debit.error === "turn_not_preferred"
          ? 403
          : debit.error === "user_disabled"
            ? 403
            : 404;
    return json({ error: debit.error }, status);
  }
  const gen = await generateCloudflareIceServers(env);
  if (!gen.ok) {
    // Refund 1 credit on provider failure
    await addCredits(env.STORE, ownerUserId, 1, "turn_mint_refund");
    return json({ error: gen.error }, gen.status);
  }
  return json({
    iceServers: gen.iceServers,
    ttl_sec: gen.ttlSec,
    balance: debit.balance,
  });
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
  const user = await getUser(env.STORE, key.userId);
  if (user?.disabled) {
    return { ok: false, res: json({ error: "forbidden" }, 403) };
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

function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".workers.dev")
  );
}

function isWorkerOwnedPath(pathname: string): boolean {
  return (
    pathname === "/health" ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/i/") ||
    pathname === "/favicon.svg" ||
    pathname === "/favicon.ico"
  );
}

/** Serve Kit static assets for dash UI (SPA fallback via wrangler assets). */
async function serveDashAssets(
  request: Request,
  env: Env,
  url: URL
): Promise<Response | null> {
  const host = requestHostname(request);
  const path = url.pathname;
  const isDash = isDashHost(host);
  const isApi = isApiHost(host);
  const isLocal = isLocalHost(host);

  if (path === "/favicon.svg" || path === "/favicon.ico") {
    return new Response(FAVICON_SVG, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  if (
    isApi &&
    (path === "/" ||
      path === "/admin" ||
      path === "/admin/" ||
      path === "/bootstrap" ||
      path === "/bootstrap/")
  ) {
    const dest =
      path.startsWith("/bootstrap") ? `${DASH_ORIGIN}/bootstrap/` : `${DASH_ORIGIN}/`;
    return Response.redirect(dest, 302);
  }

  const joinMatch = /^\/join\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (isApi && joinMatch) {
    return Response.redirect(`${DASH_ORIGIN}/join/${joinMatch[1]}`, 302);
  }

  if (
    request.method === "GET" &&
    (isDash || isLocal) &&
    env.ASSETS &&
    !isWorkerOwnedPath(path)
  ) {
    return env.ASSETS.fetch(request);
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
      const dash = await serveDashAssets(request, env, url);
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

  // Public registration-invite status (dash Kit landing)
  const joinStatusMatch = /^\/v1\/join\/([A-Za-z0-9_-]+)$/.exec(pathname);
  if (request.method === "GET" && joinStatusMatch) {
    const token = joinStatusMatch[1]!;
    const inv = await getRegistrationInvite(env.STORE, token);
    if (!inv) {
      return json({ ok: false, status: "not_found" }, 404);
    }
    if (Date.now() >= inv.expiresAt) {
      return json(
        { ok: false, status: "expired", expires_at: inv.expiresAt },
        410
      );
    }
    if (inv.usedAt) {
      return json({ ok: false, status: "used" }, 410);
    }
    return json({
      ok: true,
      status: "valid",
      expires_at: inv.expiresAt,
      token,
    });
  }

  if (request.method === "GET" && pathname === "/health") {
    return json({
      ok: true,
      service: "playgrounds-platform-api",
      github_oauth: githubOAuthConfigured(env),
      google_oauth: googleOAuthConfigured(env),
    });
  }

  // —— Social SSO (GitHub / Google) ——
  async function parseOAuthIntent(): Promise<
    { ok: true; intent: OAuthIntent } | { ok: false; res: Response }
  > {
    const intentParam = url.searchParams.get("intent") || "login";
    if (intentParam === "join") {
      const inviteToken = url.searchParams.get("token") || "";
      if (!inviteToken) {
        return { ok: false, res: json({ error: "bad_request" }, 400) };
      }
      return { ok: true, intent: { intent: "join", inviteToken } };
    }
    if (intentParam === "link") {
      const auth = await requireAccessToken(env, request);
      if (!auth.ok) return { ok: false, res: auth.res };
      return { ok: true, intent: { intent: "link", userId: auth.userId } };
    }
    if (intentParam === "bootstrap") {
      const bootstrapToken =
        url.searchParams.get("bootstrap_token") ||
        url.searchParams.get("token") ||
        "";
      if (!bootstrapToken) {
        return { ok: false, res: json({ error: "bad_request" }, 400) };
      }
      return {
        ok: true,
        intent: { intent: "bootstrap", bootstrapToken },
      };
    }
    return { ok: true, intent: { intent: "login" } };
  }

  if (request.method === "GET" && pathname === "/auth/github") {
    if (!githubOAuthConfigured(env)) {
      return json({ error: "github_oauth_not_configured" }, 503);
    }
    const parsed = await parseOAuthIntent();
    if (!parsed.ok) return parsed.res;
    const state = await encodeOAuthState(env.OAUTH_STATE_SECRET!, parsed.intent);
    const redirectUri = oauthCallbackUri(request, "github");
    return Response.redirect(
      githubAuthorizeUrl({
        clientId: env.GITHUB_CLIENT_ID!,
        redirectUri,
        state,
      }),
      302
    );
  }

  if (request.method === "GET" && pathname === "/auth/google") {
    if (!googleOAuthConfigured(env)) {
      return json({ error: "google_oauth_not_configured" }, 503);
    }
    const parsed = await parseOAuthIntent();
    if (!parsed.ok) return parsed.res;
    const state = await encodeOAuthState(env.OAUTH_STATE_SECRET!, parsed.intent);
    const redirectUri = oauthCallbackUri(request, "google");
    return Response.redirect(
      googleAuthorizeUrl({
        clientId: env.GOOGLE_CLIENT_ID!,
        redirectUri,
        state,
      }),
      302
    );
  }

  if (request.method === "GET" && pathname === "/auth/github/callback") {
    const origin = new URL(request.url).origin;
    if (!githubOAuthConfigured(env)) {
      return dashErrorRedirect(origin, "github_oauth_not_configured");
    }
    const oauthErr = url.searchParams.get("error");
    if (oauthErr) return dashErrorRedirect(origin, oauthErr);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return dashErrorRedirect(origin, "missing_code");
    const state = await decodeOAuthState(env.OAUTH_STATE_SECRET!, stateRaw);
    if (!state) return dashErrorRedirect(origin, "invalid_state");

    const errPath = state.intent === "bootstrap" ? "/bootstrap/" : "/";
    const fail = (c: string) => dashErrorRedirect(origin, c, errPath);

    const redirectUri = oauthCallbackUri(request, "github");
    const exchanged = await exchangeGithubCode({
      clientId: env.GITHUB_CLIENT_ID!,
      clientSecret: env.GITHUB_CLIENT_SECRET!,
      code,
      redirectUri,
    });
    if ("error" in exchanged) return fail("token_exchange_failed");
    const profile = await fetchGithubProfile(exchanged.accessToken);
    if ("error" in profile) return fail("github_user_failed");

    return completeSsoIntent({
      env,
      state,
      subject: {
        provider: "github",
        id: profile.id,
        label: profile.login,
      },
      fail,
      success: (accessToken, expiresAt, extra) =>
        dashSuccessRedirect(env, request, accessToken, expiresAt, extra),
    });
  }

  if (request.method === "GET" && pathname === "/auth/google/callback") {
    const origin = new URL(request.url).origin;
    if (!googleOAuthConfigured(env)) {
      return dashErrorRedirect(origin, "google_oauth_not_configured");
    }
    const oauthErr = url.searchParams.get("error");
    if (oauthErr) return dashErrorRedirect(origin, oauthErr);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) return dashErrorRedirect(origin, "missing_code");
    const state = await decodeOAuthState(env.OAUTH_STATE_SECRET!, stateRaw);
    if (!state) return dashErrorRedirect(origin, "invalid_state");

    const errPath = state.intent === "bootstrap" ? "/bootstrap/" : "/";
    const fail = (c: string) => dashErrorRedirect(origin, c, errPath);

    const redirectUri = oauthCallbackUri(request, "google");
    const exchanged = await exchangeGoogleCode({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      code,
      redirectUri,
    });
    if ("error" in exchanged) return fail("token_exchange_failed");
    const profile = await fetchGoogleProfile(exchanged.accessToken);
    if ("error" in profile) return fail("google_user_failed");

    return completeSsoIntent({
      env,
      state,
      subject: {
        provider: "google",
        id: profile.id,
        label: profile.email,
      },
      fail,
      success: (accessToken, expiresAt, extra) =>
        dashSuccessRedirect(env, request, accessToken, expiresAt, extra),
    });
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
      google: user?.google
        ? { id: user.google.id, email: user.google.email }
        : null,
      key: key
        ? { prefix: key.prefix, created_at: key.createdAt }
        : null,
      default_field_url: defaultFieldOriginOrFallback(user?.defaultFieldUrl),
      credits: user ? userCredits(user) : 0,
      turn_hosted: user ? userTurnHosted(user) : false,
      turn_prefer: user ? userTurnPrefer(user) : false,
    });
  }

  if (request.method === "GET" && pathname === "/v1/me/credits") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const user = await getUser(env.STORE, auth.userId);
    if (!user) return json({ error: "user_not_found" }, 404);
    return json({
      balance: userCredits(user),
      turn_hosted: userTurnHosted(user),
      turn_prefer: userTurnPrefer(user),
    });
  }

  if (request.method === "GET" && pathname === "/v1/me/credits/sessions") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const sessions = await listCreditSessions(env.STORE, auth.userId);
    return json({ sessions });
  }

  // Update account preferences (default field)
  if (request.method === "PATCH" && pathname === "/v1/me") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const user = await getUser(env.STORE, auth.userId);
    if (!user) return json({ error: "user_not_found" }, 404);
    const body = (await request.json().catch(() => ({}))) as {
      default_field_url?: string;
      turn_prefer?: boolean;
    };
    if (typeof body.default_field_url === "string") {
      const normalized = normalizeFieldOrigin(body.default_field_url);
      if (!normalized) {
        return json({ error: "invalid_default_field_url" }, 400);
      }
      user.defaultFieldUrl = normalized;
      await putUser(env.STORE, user);
    }
    if (typeof body.turn_prefer === "boolean") {
      const pref = await setTurnPrefer(
        env.STORE,
        auth.userId,
        body.turn_prefer
      );
      if (!pref.ok) {
        const status =
          pref.error === "turn_not_entitled"
            ? 403
            : pref.error === "user_disabled"
              ? 403
              : 404;
        return json({ error: pref.error }, status);
      }
    }
    const fresh = await getUser(env.STORE, auth.userId);
    return json({
      ok: true,
      default_field_url: defaultFieldOriginOrFallback(fresh?.defaultFieldUrl),
      turn_hosted: fresh ? userTurnHosted(fresh) : false,
      turn_prefer: fresh ? userTurnPrefer(fresh) : false,
      credits: fresh ? userCredits(fresh) : 0,
    });
  }

  // Host provision: rotate key + short-lived token (no pg_sk_ in response URL builder only)
  if (request.method === "POST" && pathname === "/v1/field/provision") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const user = await getUser(env.STORE, auth.userId);
    if (!user || user.disabled) {
      return json({ error: "forbidden" }, 403);
    }
    const body = (await request.json().catch(() => ({}))) as {
      target_field?: string;
    };
    let fieldOrigin = defaultFieldOriginOrFallback(user.defaultFieldUrl);
    if (typeof body.target_field === "string" && body.target_field.trim()) {
      const normalized = normalizeFieldOrigin(body.target_field);
      if (!normalized) {
        return json({ error: "invalid_target_field" }, 400);
      }
      fieldOrigin = normalized;
    }
    const prov = await createFieldProvision(
      env.STORE,
      auth.userId,
      auth.role
    );
    const fieldUrl = fieldProvisionDeepLink(fieldOrigin, prov.provisionToken);
    return json({
      provision_token: prov.provisionToken,
      expires_at: prov.expiresAt,
      field_url: fieldUrl,
      key: { prefix: prov.keyPrefix, created_at: prov.keyCreatedAt },
      note: "Open field_url once. API key is not in the URL; redeem on the field shell into memory.",
    });
  }

  // Redeem provision → api_key once (field shell; no access token required)
  if (request.method === "POST" && pathname === "/v1/field/provision/redeem") {
    const body = (await request.json().catch(() => ({}))) as {
      provision_token?: string;
    };
    const fromBody =
      typeof body.provision_token === "string" ? body.provision_token.trim() : "";
    const bearer = parseBearer(request);
    const token =
      fromBody ||
      (bearer && bearer.startsWith("pg_pv_") ? bearer : "") ||
      "";
    if (!token) return json({ error: "unauthorized" }, 401);
    const result = await redeemFieldProvision(env.STORE, token);
    if (!result.ok) {
      const status =
        result.error === "expired" || result.error === "used" ? 410 : 401;
      return json({ error: result.error }, status);
    }
    return json({
      api_key: result.apiKey,
      note: "Store in field shell memory only. Not for SecretStore.",
    });
  }

  // Delete own account
  if (request.method === "DELETE" && pathname === "/v1/me") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const result = await deleteUserAccount(env.STORE, auth.userId);
    if (!result.ok) {
      const status = result.error === "last_admin" ? 409 : 404;
      return json({ error: result.error }, status);
    }
    return json(
      { ok: true },
      200,
      { "Set-Cookie": clearSessionCookieHeader(request) }
    );
  }

  // Unlink Social SSO (keep ≥1)
  const unlinkSsoMatch = /^\/v1\/me\/sso\/(github|google)$/.exec(pathname);
  if (request.method === "DELETE" && unlinkSsoMatch) {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    const provider = unlinkSsoMatch[1]!;
    const result =
      provider === "github"
        ? await unlinkGithub(env.STORE, auth.userId)
        : await unlinkGoogle(env.STORE, auth.userId);
    if (!result.ok) {
      const status =
        result.error === "last_sso"
          ? 409
          : result.error === "not_linked"
            ? 404
            : 400;
      return json({ error: result.error }, status);
    }
    return json({ ok: true });
  }

  // Admin: list registered users
  if (request.method === "GET" && pathname === "/v1/admin/users") {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    if (auth.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }
    const users = await listUsers(env.STORE);
    const items = await Promise.all(
      users.map(async (u) => {
        const key = await getApiKeyForUser(env.STORE, u.userId);
        return {
          user_id: u.userId,
          role: u.role,
          disabled: Boolean(u.disabled),
          created_at: u.createdAt,
          github: u.github
            ? { id: u.github.id, login: u.github.login }
            : null,
          google: u.google
            ? { id: u.google.id, email: u.google.email }
            : null,
          key: key
            ? { prefix: key.prefix, created_at: key.createdAt }
            : null,
          credits: userCredits(u),
          turn_hosted: userTurnHosted(u),
        };
      })
    );
    return json({ users: items });
  }

  // Admin: disable / enable user
  const adminUserAction = /^\/v1\/admin\/users\/([^/]+)\/(disable|enable)$/.exec(
    pathname
  );
  if (request.method === "POST" && adminUserAction) {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    if (auth.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }
    const targetId = decodeURIComponent(adminUserAction[1]!);
    const disable = adminUserAction[2] === "disable";
    const result = await setUserDisabled(
      env.STORE,
      targetId,
      disable,
      auth.userId
    );
    if (!result.ok) {
      const status =
        result.error === "last_admin" || result.error === "cannot_disable_self"
          ? 409
          : 404;
      return json({ error: result.error }, status);
    }
    return json({
      ok: true,
      user_id: result.user.userId,
      disabled: Boolean(result.user.disabled),
    });
  }

  // Admin: add credits
  const adminCredits = /^\/v1\/admin\/users\/([^/]+)\/credits$/.exec(pathname);
  if (request.method === "POST" && adminCredits) {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    if (auth.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }
    const targetId = decodeURIComponent(adminCredits[1]!);
    const body = (await request.json().catch(() => ({}))) as {
      amount?: number;
      note?: string;
    };
    const result = await addCredits(
      env.STORE,
      targetId,
      Number(body.amount),
      body.note
    );
    if (!result.ok) {
      const status =
        result.error === "invalid_amount"
          ? 400
          : result.error === "user_disabled"
            ? 403
            : 404;
      return json({ error: result.error }, status);
    }
    return json({ ok: true, balance: result.balance });
  }

  // Admin: turn.hosted entitlement
  const adminTurnEnt =
    /^\/v1\/admin\/users\/([^/]+)\/entitlements\/turn\.hosted$/.exec(pathname);
  if (request.method === "POST" && adminTurnEnt) {
    const auth = await requireAccessToken(env, request);
    if (!auth.ok) return auth.res;
    if (auth.role !== "admin") {
      return json({ error: "forbidden" }, 403);
    }
    const targetId = decodeURIComponent(adminTurnEnt[1]!);
    const body = (await request.json().catch(() => ({}))) as {
      enabled?: boolean;
    };
    if (typeof body.enabled !== "boolean") {
      return json({ error: "invalid_enabled" }, 400);
    }
    const result = await setTurnHosted(env.STORE, targetId, body.enabled);
    if (!result.ok) {
      const status = result.error === "user_disabled" ? 403 : 404;
      return json({ error: result.error }, status);
    }
    return json({ ok: true, turn_hosted: result.turnHosted });
  }

  // Host: mint TURN iceServers (API key)
  if (request.method === "POST" && pathname === "/v1/field/turn/credentials") {
    const auth = await requireApiKey(env, request);
    if (!auth.ok) return auth.res;
    const body = (await request.json().catch(() => ({}))) as {
      session_id?: string;
    };
    return mintTurnIceServers(
      env,
      auth.userId,
      typeof body.session_id === "string" ? body.session_id : undefined
    );
  }

  // Guest: mint TURN iceServers (join_cap) — billed to invite owner
  const guestTurn =
    /^\/v1\/invites\/([^/]+)\/turn\/credentials$/.exec(pathname);
  if (request.method === "POST" && guestTurn) {
    const joinCap = parseBearer(request);
    if (!joinCap) return json({ error: "unauthorized" }, 401);
    const inviteId = decodeURIComponent(guestTurn[1]!);
    const stub = inviteStub(env, inviteId);
    const validated = await stub.fetch("https://invite/validate-join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joinCap }),
    });
    const vText = await validated.text();
    let vData: {
      error?: string;
      ownerUserId?: string;
      joinId?: string;
    } = {};
    try {
      vData = vText ? JSON.parse(vText) : {};
    } catch {
      /* ignore */
    }
    if (!validated.ok) {
      return json(
        { error: vData.error || "invalid_join_cap" },
        validated.status
      );
    }
    if (!vData.ownerUserId) {
      return json({ error: "invalid_join_cap" }, 403);
    }
    return mintTurnIceServers(env, vData.ownerUserId, vData.joinId);
  }

  // Rotate / create field API key — legacy; prefer POST /v1/field/provision
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
      note: "Legacy. Prefer POST /v1/field/provision — field shell memory via redeem.",
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
        access_token: claimed.accessToken,
        expires_at: claimed.accessTokenExpiresAt,
        note: "Account created. Create a field API key from the dashboard when needed.",
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
