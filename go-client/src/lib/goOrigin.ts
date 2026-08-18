/** Page origin for go mint／share (DEC-050). Official go, or loopback in `go:dev`. */

export const GO_PUBLIC_ORIGIN = "https://go.samkuo.me";

export function isLoopbackPageOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function goPageOrigin(loc?: {
  origin?: string;
  hostname?: string;
} | null): string {
  const page =
    loc ??
    (typeof location !== "undefined"
      ? { origin: location.origin, hostname: location.hostname }
      : null);
  const origin = page?.origin?.trim() || "";
  const host = (page?.hostname || "").toLowerCase();
  if (
    origin &&
    (host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".localhost"))
  ) {
    return origin.replace(/\/$/, "");
  }
  return GO_PUBLIC_ORIGIN;
}

/**
 * Platform always stamps official go on `short_url`. When minting from
 * `go:dev`, rewrite the door onto this page so QR／copy stay on localhost.
 */
export function localizeInviteShortUrl(
  shortUrl: string,
  pageOrigin: string
): string {
  if (!isLoopbackPageOrigin(pageOrigin)) return shortUrl;
  try {
    const u = new URL(shortUrl);
    if (!u.pathname.startsWith("/i/")) return shortUrl;
    const local = new URL(pageOrigin);
    u.protocol = local.protocol;
    u.host = local.host;
    return u.toString().replace(/\/$/, "");
  } catch {
    return shortUrl;
  }
}
