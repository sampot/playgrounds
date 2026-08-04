/**
 * Offline SW fetch strategy selection (DEC-009 + DEC-041).
 * Keep decision rules aligned with `public/sw.js` (`respondWithOfflineCache`).
 *
 * Online safety: every cacheable path uses network-first (or network-only for
 * non-Playgrounds navigations). There is no cache-first path — hashed `/_astro/*`
 * still revalidates while online so a sticky SW Cache entry cannot pin a broken
 * bundle after deploy.
 */

import { isPlaygroundsCanvasPathname } from "../components/playgrounds/playgroundsPaths";

export type SwFetchStrategy =
  | "network-first-document"
  | "network-only-navigate"
  | "network-first-asset"
  | "passthrough";

export const OFFLINE_URL = "/offline/";

export function isCanvasVirtualPath(pathname: string): boolean {
  return isPlaygroundsCanvasPathname(pathname);
}

/** SW entry only — browser update algorithm must fetch it without SW respondWith. */
export function isSwEntryScript(pathname: string): boolean {
  return pathname === "/sw.js";
}

/** @deprecated use isSwEntryScript; kept for older call sites */
export function isServiceWorkerScript(pathname: string): boolean {
  return isSwEntryScript(pathname);
}

/**
 * Paths eligible for Playgrounds offline document/asset cache.
 * Blog: `/playgrounds/**`. Standalone host root is handled in `public/sw.js`
 * (hostname gate); strategy helpers here cover path shape only.
 */
export function isPlaygroundsOfflinePath(pathname: string): boolean {
  if (isCanvasVirtualPath(pathname)) return false;
  if (isSwEntryScript(pathname)) return false;
  return (
    pathname === OFFLINE_URL ||
    pathname === "/playgrounds" ||
    pathname === "/playgrounds/" ||
    pathname.startsWith("/playgrounds/")
  );
}

export function isDevOnlyPath(pathname: string): boolean {
  return (
    pathname.startsWith("/node_modules/") ||
    pathname.startsWith("/@id/") ||
    pathname.startsWith("/@vite/") ||
    pathname.startsWith("/@fs/") ||
    pathname.startsWith("/src/") ||
    pathname.includes("/.vite/")
  );
}

export function isHashedAstroAsset(pathname: string): boolean {
  return pathname.startsWith("/_astro/");
}

export function shouldNetworkFirstAsset(pathname: string): boolean {
  if (isDevOnlyPath(pathname)) return false;
  if (isCanvasVirtualPath(pathname)) return false;
  if (isSwEntryScript(pathname)) return false;
  if (pathname.startsWith("/icons/")) return true;
  if (pathname === "/favicon.svg") return true;
  if (pathname === "/manifest.webmanifest") return true;
  if (pathname === "/register-sw.js") return true;
  if (pathname === "/toggle-theme.js" || pathname === "/toggle-font-size.js") {
    return true;
  }
  // Include /_astro/* — network-first while online; cache only as offline fallback.
  if (isHashedAstroAsset(pathname)) return true;
  return /\.(?:js|css|woff2?|ttf|otf|png|svg|webp|ico|wasm)$/i.test(pathname);
}

/**
 * URLs to precache after a Playgrounds HTML response (keep in sync with sw.js).
 */
export function extractShellAssetUrls(html: string, origin: string): string[] {
  const urls = new Set<string>();
  const add = (path: string) => {
    const clean = path.split("?")[0] ?? "";
    if (!clean.startsWith("/")) return;
    try {
      urls.add(new URL(clean, origin).href);
    } catch {
      /* ignore */
    }
  };
  // Astro islands use component-url / renderer-url, not only src/href.
  const astroRe = /\/_astro\/[A-Za-z0-9_.-]+/g;
  let m: RegExpExecArray | null;
  while ((m = astroRe.exec(html))) {
    add(m[0]);
  }
  const attrRe =
    /(?:src|href)=["'](\/(?:register-sw|toggle-theme|toggle-font-size)\.js[^"']*|\/icons\/[^"']+|\/favicon\.svg)["']/gi;
  while ((m = attrRe.exec(html))) {
    add(m[1] ?? "");
  }
  return [...urls];
}

/**
 * Choose how the site SW should handle a same-origin GET (non-canvas).
 * Canvas virtual paths are handled before this runs.
 */
export function selectOfflineFetchStrategy(options: {
  pathname: string;
  requestMode: string;
  method?: string;
}): SwFetchStrategy {
  const method = options.method ?? "GET";
  if (method !== "GET") return "passthrough";
  if (isSwEntryScript(options.pathname)) return "passthrough";
  if (isCanvasVirtualPath(options.pathname)) return "passthrough";
  // Vite / Astro-dev — never SW-cache (localhost `astro dev` safe).
  if (isDevOnlyPath(options.pathname)) return "passthrough";

  if (isPlaygroundsOfflinePath(options.pathname)) {
    return "network-first-document";
  }
  if (options.requestMode === "navigate") {
    return "network-only-navigate";
  }
  if (shouldNetworkFirstAsset(options.pathname)) {
    return "network-first-asset";
  }
  return "passthrough";
}

/** True when a successful network response must be preferred over Cache API. */
export function strategyPrefersNetworkWhileOnline(
  strategy: SwFetchStrategy
): boolean {
  return (
    strategy === "network-first-document" ||
    strategy === "network-first-asset" ||
    strategy === "network-only-navigate"
  );
}
