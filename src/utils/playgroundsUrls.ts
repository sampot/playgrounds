/**
 * Playgrounds share / deep-link URLs (DEC-041).
 * Kept under `utils/` so catalog／tools pages need not import the app shell.
 */

/** Formal field after cutover. */
export const PLAYGROUNDS_CANONICAL_ORIGIN = "https://playgrounds.samkuo.me";

/** Canonical home URL (trailing slash). */
export function playgroundsCanonicalHomeUrl(): string {
  return `${PLAYGROUNDS_CANONICAL_ORIGIN}/`;
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
  return `${origin}${normalized}?${params.toString()}`;
}
