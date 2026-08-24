/** Invite default TTL: session already started; not a reservation. */
export const INVITE_TTL_MS = 5 * 60 * 1000;

/** Long-poll wait for offer/answer within one Worker request. */
export const HANDSHAKE_WAIT_MS = 25_000;

export const DEFAULT_TARGET_FIELD = "play.samkuo.me";

/** Canonical API host for short links (dash is UI-only alias). */
export const CANONICAL_API_ORIGIN = "https://api.samkuo.me";

export const DASH_ORIGIN = "https://dash.samkuo.me";

export function requestHostname(request: Request): string {
  return new URL(request.url).hostname.toLowerCase();
}

export function isDashHost(hostname: string): boolean {
  return hostname.toLowerCase() === "dash.samkuo.me";
}

export function isApiHost(hostname: string): boolean {
  return hostname.toLowerCase() === "api.samkuo.me";
}

/** Prefer api.samkuo.me for short URLs in production; else request origin. */
export function shortLinkOrigin(request: Request): string {
  const host = requestHostname(request);
  if (host === "api.samkuo.me" || host === "dash.samkuo.me") {
    return CANONICAL_API_ORIGIN;
  }
  return new URL(request.url).origin;
}

const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** High-entropy URL-safe id (no padding). */
export function randomId(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += B64URL[bytes[i]! % 64]!;
  }
  return out;
}

export function apiKeyPlaintext(): string {
  return `pg_sk_${randomId(24)}`;
}

/** Booth hub device credential (pg-boothd / pg-booth-desktop anchor). */
export function deviceTokenPlaintext(): string {
  return `pg_dt_${randomId(24)}`;
}

/** Dashboard session Bearer — not for field shell. */
export function accessTokenPlaintext(): string {
  return `pg_at_${randomId(24)}`;
}

export function joinCapPlaintext(): string {
  return `pg_jc_${randomId(20)}`;
}

/** BoothAnchor Engine WSS credential (hub only). */
export function anchorSecretPlaintext(): string {
  return `pg_ba_${randomId(24)}`;
}

/** Short-lived Operator Shell cap (DEC-051 E2). */
export function operatorCapPlaintext(): string {
  return `pg_op_${randomId(24)}`;
}

export const OPERATOR_CAP_TTL_MS = 5 * 60 * 1000;

/** Default dashboard access token TTL (7d). */
export const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Short-lived Host provision token (dash → field shell). */
export const PROVISION_TTL_MS = 120_000;

/** Official field reserved names (DEC-042); not valid default_field_url. */
export const FIELD_RESERVED_SUBDOMAINS = [
  "www",
  "blog",
  "api",
  "docs",
  "dash",
  "go",
  "old-blog",
] as const;

/** Pure-play Guest client (DEC-050); invite short_url canonical origin. */
export const DEFAULT_GO_ORIGIN = "https://go.samkuo.me";

export function shortId(): string {
  return randomId(10);
}

/** One-time field provision Bearer — not an API key. */
export function provisionTokenPlaintext(): string {
  return `pg_pv_${randomId(24)}`;
}

export function inviteSecret(): string {
  return randomId(24);
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const dig = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(dig)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function keyPrefix(plaintext: string): string {
  // pg_sk_ + first 8 of body for display / lookup hint
  const body = plaintext.startsWith("pg_sk_")
    ? plaintext.slice(6)
    : plaintext;
  return `pg_sk_${body.slice(0, 8)}`;
}

export function deviceTokenPrefix(plaintext: string): string {
  const body = plaintext.startsWith("pg_dt_")
    ? plaintext.slice(6)
    : plaintext;
  return `pg_dt_${body.slice(0, 8)}`;
}

export function fieldDeepLink(
  targetField: string,
  secret: string
): string {
  const origin =
    normalizeFieldOrigin(targetField) ||
    `https://${DEFAULT_TARGET_FIELD}`;
  return `${origin}/#pg=${encodeURIComponent(secret)}`;
}

/**
 * Host provision deep link — never embeds pg_sk_. `returnTo` is an optional
 * same-origin path (e.g. go `/s/pg-gomoku`) the user started from, so the
 * provision lands on that page instead of the field root.
 */
export function fieldProvisionDeepLink(
  fieldOriginOrHost: string,
  provisionToken: string,
  returnTo?: string
): string {
  const origin = normalizeFieldOrigin(fieldOriginOrHost) || `https://${DEFAULT_TARGET_FIELD}`;
  let path = "/";
  if (returnTo) {
    const clean = sanitizeFieldReturn(returnTo);
    if (clean) path = clean;
  }
  return `${origin}${path}#pg_provision=${encodeURIComponent(provisionToken)}`;
}

/** Sanitize a same-origin return path for the provision deep link. */
export function sanitizeFieldReturn(
  input: string | undefined | null
): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw || raw === "/") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("#")) return null;
  if (raw.split("/").includes("..")) return null;
  if (raw.length > 512) return null;
  return raw;
}

/**
 * Invite short URL — always on the go client origin (DEC-050).
 * `origin` override is for local go-client / tests only.
 */
export function shortUrl(id: string, origin: string = DEFAULT_GO_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}/i/${id}`;
}

/** Loopback targetField (go:dev) keeps short_url on that origin; else official go. */
export function inviteShortUrlOrigin(
  targetField: string,
  goOrigin: string = DEFAULT_GO_ORIGIN
): string {
  const field = normalizeFieldOrigin(targetField);
  if (field) {
    try {
      const host = new URL(field).hostname.toLowerCase();
      if (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".localhost")
      ) {
        return field;
      }
    } catch {
      /* fall through */
    }
  }
  return goOrigin.replace(/\/$/, "");
}

/** Resolve go public origin from env (wrangler vars) or default. */
export function goPublicOrigin(env?: {
  GO_PUBLIC_ORIGIN?: string;
}): string {
  const raw = env?.GO_PUBLIC_ORIGIN?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return DEFAULT_GO_ORIGIN;
}

/**
 * Normalize field to origin (no path) or null if invalid.
 * Official `*.samkuo.me` → https. Loopback (`localhost`／`127.0.0.1`／`*.localhost`) → keep http(s);
 * bare host without scheme defaults to **http** for loopback, else https.
 * `*.localhost` covers Tauri on Windows/Android (`http(s)://tauri.localhost`).
 * `tauri:` covers Tauri on macOS/Linux (`tauri://localhost` for pg-booth-desktop).
 */
export function normalizeFieldOrigin(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    if (raw.includes("://")) {
      url = new URL(raw);
    } else {
      const hostname = raw.split("/")[0]?.split(":")[0]?.toLowerCase() || "";
      const loopbackBare =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".localhost");
      const scheme = loopbackBare ? "http" : "https";
      url = new URL(`${scheme}://${raw}`);
    }
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const loopbackHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost");
  if (loopbackHost) {
    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:" &&
      url.protocol !== "tauri:"
    ) {
      return null;
    }
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${host}${port}`;
  }
  if (url.protocol !== "https:") return null;
  if (host === "samkuo.me") return null;
  if (!host.endsWith(".samkuo.me")) return null;
  const sub = host.slice(0, -".samkuo.me".length);
  if (!sub || sub.includes(".")) return null;
  // `go` stays a reserved name (DEC-050) but is exceptionally a valid provision
  // target for the pure-play client (DEC-052).
  if (sub === "go") return `https://${host}`;
  if ((FIELD_RESERVED_SUBDOMAINS as readonly string[]).includes(sub)) {
    return null;
  }
  return `https://${host}`;
}

export function defaultFieldOriginOrFallback(
  stored: string | null | undefined
): string {
  return normalizeFieldOrigin(stored || "") || `https://${DEFAULT_TARGET_FIELD}`;
}
