import type { GithubOAuthEnv } from "./githubOAuth.js";

export type GoogleOAuthEnv = GithubOAuthEnv & {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export type GoogleProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export function googleOAuthConfigured(env: GoogleOAuthEnv): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.OAUTH_STATE_SECRET
  );
}

export function googleAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", opts.scope || "openid email profile");
  u.searchParams.set("state", opts.state);
  u.searchParams.set("access_type", "online");
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export async function exchangeGoogleCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string } | { error: string }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
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

export async function fetchGoogleProfile(
  accessToken: string
): Promise<GoogleProfile | { error: string }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    return { error: `google_user_${res.status}` };
  }
  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string | null;
    picture?: string | null;
  };
  if (!data.sub) return { error: "google_user_missing_sub" };
  const email = (data.email || "").trim().toLowerCase();
  if (!email) return { error: "google_user_missing_email" };
  return {
    id: data.sub,
    email,
    name: data.name ?? null,
    avatarUrl: data.picture ?? null,
  };
}
