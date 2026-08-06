import { randomId } from "./ids.js";

export type GithubOAuthEnv = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  OAUTH_STATE_SECRET?: string;
  ADMIN_BOOTSTRAP_TOKEN?: string;
};

export type GithubProfile = {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
};

export type OAuthIntent =
  | { intent: "login" }
  | { intent: "join"; inviteToken: string }
  | { intent: "link"; userId: string }
  | { intent: "bootstrap"; bootstrapToken: string };

type StatePayload = OAuthIntent & { n: string; exp: number };

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(obj: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64urlJson<T>(s: string): T {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return JSON.parse(decodeURIComponent(escape(atob(b64)))) as T;
}

async function hmacSign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return b64url(sig);
}

export function githubOAuthConfigured(env: GithubOAuthEnv): boolean {
  return Boolean(
    env.GITHUB_CLIENT_ID &&
      env.GITHUB_CLIENT_SECRET &&
      env.OAUTH_STATE_SECRET
  );
}

export async function encodeOAuthState(
  secret: string,
  intent: OAuthIntent,
  ttlMs = 10 * 60 * 1000
): Promise<string> {
  const payload: StatePayload = {
    ...intent,
    n: randomId(12),
    exp: Date.now() + ttlMs,
  };
  const body = b64urlJson(payload);
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

export async function decodeOAuthState(
  secret: string,
  state: string
): Promise<StatePayload | null> {
  const i = state.lastIndexOf(".");
  if (i <= 0) return null;
  const body = state.slice(0, i);
  const sig = state.slice(i + 1);
  const expect = await hmacSign(secret, body);
  if (sig !== expect) return null;
  try {
    const payload = fromB64urlJson<StatePayload>(body);
    if (!payload || typeof payload.exp !== "number") return null;
    if (Date.now() >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function githubAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("scope", opts.scope || "read:user");
  return u.toString();
}

export async function exchangeGithubCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string } | { error: string }> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });
  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    return {
      error: data.error_description || data.error || "token_exchange_failed",
    };
  }
  return { accessToken: data.access_token };
}

export async function fetchGithubProfile(
  accessToken: string
): Promise<GithubProfile | { error: string }> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "playgrounds-platform-api",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    return { error: `github_user_${res.status}` };
  }
  const data = (await res.json()) as {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string | null;
  };
  return {
    id: String(data.id),
    login: data.login,
    name: data.name ?? null,
    avatarUrl: data.avatar_url ?? null,
  };
}

export function oauthCallbackUri(
  request: Request,
  provider: "github" | "google" = "github"
): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/${provider}/callback`;
}

export const SESSION_COOKIE = "pg_session";

export function sessionCookieHeader(
  accessToken: string,
  maxAgeSec: number,
  request: Request
): string {
  const host = new URL(request.url).hostname;
  const secure =
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    !host.endsWith(".workers.dev");
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(accessToken)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(1, Math.floor(maxAgeSec))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookieHeader(request: Request): string {
  const host = new URL(request.url).hostname;
  const secure =
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    !host.endsWith(".workers.dev");
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(req: Request): string | null {
  const raw = req.headers.get("Cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      const v = rest.join("=");
      try {
        return decodeURIComponent(v);
      } catch {
        return v || null;
      }
    }
  }
  return null;
}
