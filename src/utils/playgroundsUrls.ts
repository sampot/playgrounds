/**
 * Playgrounds share / deep-link URLs (DEC-041／042).
 * Kept under `utils/` so catalog／tools pages need not import the app shell.
 */

/** Default field host (document／migrate／share examples). */
export const PLAYGROUNDS_DEFAULT_FIELD_HOST = "play.samkuo.me";

/** Formal default field origin after cutover. */
export const PLAYGROUNDS_CANONICAL_ORIGIN = `https://${PLAYGROUNDS_DEFAULT_FIELD_HOST}`;

/**
 * Origin for in-field share links (DEC-042): `location.origin` when in a
 * browser; otherwise the canonical default field.
 */
export function fieldShareOrigin(): string {
  if (typeof location !== "undefined" && location.origin) {
    return location.origin;
  }
  return PLAYGROUNDS_CANONICAL_ORIGIN;
}

/**
 * Subdomains that must not run as a Playgrounds field (DEC-042 reserved).
 * `play` is the official default field — not listed here (it *is* a field).
 */
export const PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS = [
  "www",
  "blog",
  "api",
  "docs",
  "dash",
  "old-blog",
] as const;

/** Canonical home URL (trailing slash). */
export function playgroundsCanonicalHomeUrl(): string {
  return `${PLAYGROUNDS_CANONICAL_ORIGIN}/`;
}

/**
 * True when hostname is a field-net host: `play.samkuo.me` or other
 * single-label `*.samkuo.me` (excluding reserved), plus local test hosts.
 */
export function isPlaygroundsFieldHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "play.localhost" ||
    host === "playgrounds.localhost" ||
    host.endsWith(".play.localhost")
  ) {
    return true;
  }
  if (!host.endsWith(".samkuo.me")) return false;
  const sub = host.slice(0, -".samkuo.me".length);
  if (!sub || sub.includes(".")) return false;
  if (
    (PLAYGROUNDS_FIELD_RESERVED_SUBDOMAINS as readonly string[]).includes(sub)
  ) {
    return false;
  }
  return true;
}

/**
 * Build absolute `?open=` URL. Defaults to canonical origin + root path.
 */
export function buildCanonicalOpenUrl(
  source: string,
  options?: {
    origin?: string;
    playgroundsPath?: string;
    as?: string;
    state?: "ask" | "none";
    name?: string;
    fresh?: boolean;
    /** Catalog share / try-play: maximize canvas after open. */
    view?: "canvas" | "default";
  }
): string {
  const origin = (options?.origin ?? PLAYGROUNDS_CANONICAL_ORIGIN).replace(
    /\/$/,
    ""
  );
  const path = options?.playgroundsPath ?? "/";
  const normalized = path.endsWith("/") ? path : `${path}/`;
  const params = new URLSearchParams({ open: source.trim() });
  if (options?.as && options.as !== "work") params.set("as", options.as);
  if (options?.state === "none") params.set("state", "none");
  if (options?.name?.trim()) params.set("name", options.name.trim());
  if (options?.fresh) params.set("fresh", "1");
  if (options?.view === "canvas") params.set("view", "canvas");
  return `${origin}${normalized}?${params.toString()}`;
}
