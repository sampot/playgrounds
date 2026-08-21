/**
 * Shell → SAM canvas surface (PG-GO-ROOM-PLAY-PLAN).
 * Query `pg_surface=solo|room`; memory canvas mirrors via meta.
 */

export type GoPgSurface = "solo" | "room";

export const GO_PG_SURFACE_QUERY = "pg_surface" as const;
export const GO_PG_SURFACE_META = "pg:surface" as const;

export function normalizeGoPgSurface(raw: unknown): GoPgSurface {
  return raw === "room" ? "room" : "solo";
}

/** Append or replace `pg_surface` on a canvas entry URL. */
export function withGoPgSurfaceQuery(
  url: string,
  surface: GoPgSurface = "solo"
): string {
  try {
    const u = new URL(url, "https://go.local");
    u.searchParams.set(GO_PG_SURFACE_QUERY, surface);
    // Relative paths: keep path+search only.
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return u.toString();
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}${GO_PG_SURFACE_QUERY}=${surface}`;
  }
}

/** `<meta name="pg:surface" content="…">` for srcdoc canvases. */
export function goPgSurfaceMetaTag(surface: GoPgSurface = "solo"): string {
  return `<meta name="${GO_PG_SURFACE_META}" content="${surface}" />`;
}

export function injectGoPgSurfaceMeta(
  html: string,
  surface: GoPgSurface = "solo"
): string {
  const tag = goPgSurfaceMetaTag(surface);
  if (/name=["']pg:surface["']/i.test(html)) {
    return html.replace(
      /<meta\s+[^>]*name=["']pg:surface["'][^>]*>/iu,
      tag
    );
  }
  if (/<head[\s>]/iu.test(html)) {
    return html.replace(/<head([^>]*)>/iu, `<head$1>${tag}`);
  }
  return `${tag}${html}`;
}
