/**
 * LINE Login OAuth (v2.1 authorization code + PKCE S256) for Platform dash.
 * Differs from GitHub/Google: LINE has no email and *requires* PKCE (S256),
 * so the caller must supply a code_verifier and send its challenge on
 * authorize, then the verifier on token exchange.
 */

import type { GithubOAuthEnv } from "./githubOAuth.js";

export type LineOAuthEnv = GithubOAuthEnv & {
  LINE_CLIENT_ID?: string; // channel ID (numeric string)
  LINE_CLIENT_SECRET?: string; // channel secret
};

export type LineProfile = {
  id: string; // userId
  displayName: string;
  pictureUrl: string | null;
};

export function lineOAuthConfigured(env: LineOAuthEnv): boolean {
  return Boolean(
    env.LINE_CLIENT_ID && env.LINE_CLIENT_SECRET && env.OAUTH_STATE_SECRET
  );
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 43–128 char random verifier (RFC 7636). */
export function generateCodeVerifier(): string {
  const buf = new Uint8Array(43);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

/** PKCE S256 code challenge from a verifier. */
export async function sha256CodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return b64url(digest);
}

export function generateOAuthNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

export function lineAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce?: string;
  scope?: string;
}): string {
  const u = new URL("https://access.line.me/oauth2/v2.1/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("scope", opts.scope || "profile openid");
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  if (opts.nonce) u.searchParams.set("nonce", opts.nonce);
  return u.toString();
}

export async function exchangeLineCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string } | { error: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code_verifier: opts.codeVerifier,
  });
  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
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

export async function fetchLineProfile(
  accessToken: string
): Promise<LineProfile | { error: string }> {
  const res = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { error: `line_user_${res.status}` };
  }
  const data = (await res.json()) as {
    userId?: string;
    displayName?: string;
    pictureUrl?: string | null;
    statusMessage?: string | null;
  };
  if (!data.userId) return { error: "line_user_missing_id" };
  return {
    id: data.userId,
    displayName: data.displayName ?? data.userId,
    pictureUrl: data.pictureUrl ?? null,
  };
}
