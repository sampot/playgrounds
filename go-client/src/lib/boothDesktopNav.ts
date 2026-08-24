/**
 * pg-booth-desktop navigation policy: in-app scope is `/room` only; playground
 * links open in the system browser.
 */
import { GO_PUBLIC_ORIGIN } from "./goOrigin";
import { boothDesktopOpenExternal, isBoothDesktopShell } from "./boothDesktop";

const IN_WEBVIEW_HOSTS = new Set(["dash.samkuo.me", "api.samkuo.me"]);

/** Paths allowed inside the booth shell WebView (host Embedded Hub + operator). */
export function isBoothDesktopInAppPath(pathname: string): boolean {
  const path = (pathname.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  return path === "/room" || path.startsWith("/room/");
}

/** Redirect out-of-scope in-app paths back to the booth entry. */
export function boothDesktopScopeRedirect(pathname: string): string | null {
  return isBoothDesktopInAppPath(pathname) ? null : "/room";
}

/** @deprecated Use boothDesktopScopeRedirect */
export function boothDesktopHomeRedirectPath(pathname: string): string | null {
  return boothDesktopScopeRedirect(pathname);
}

function normalizePathname(pathname: string): string {
  const path = (pathname.split("?")[0] ?? "/").replace(/\/+$/, "") || "/";
  return path;
}

/**
 * Resolve a lobby／game／playground href to the public go origin for external open.
 * Returns null when the URL should stay in the WebView (booth paths, dash login).
 */
export function boothDesktopExternalPlaygroundUrl(
  href: string,
  baseOrigin?: string
): string | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }
  const base =
    baseOrigin?.trim() ||
    (typeof location !== "undefined" ? location.origin : "") ||
    GO_PUBLIC_ORIGIN;
  let url: URL;
  try {
    url = /^[a-z][a-z0-9+.-]*:/i.test(raw)
      ? new URL(raw)
      : new URL(raw, base.endsWith("/") ? base : `${base}/`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (IN_WEBVIEW_HOSTS.has(host)) return null;
  if (isBoothDesktopInAppPath(url.pathname)) return null;

  const loopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost") ||
    url.protocol === "tauri:";
  if (loopback) {
    return new URL(
      url.pathname + url.search + url.hash,
      GO_PUBLIC_ORIGIN
    ).toString();
  }
  if (host.endsWith(".samkuo.me")) {
    return url.toString();
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    return new URL(
      url.pathname + url.search + url.hash,
      GO_PUBLIC_ORIGIN
    ).toString();
  }
  return null;
}

export async function boothDesktopGoto(
  href: string,
  gotoFn: (
    url: string,
    opts?: { replaceState?: boolean; noScroll?: boolean; keepFocus?: boolean }
  ) => Promise<void>
): Promise<void> {
  if (!isBoothDesktopShell()) {
    await gotoFn(href);
    return;
  }
  const path = href.startsWith("/")
    ? normalizePathname(href)
    : normalizePathname(
        (() => {
          try {
            return new URL(href, location.href).pathname;
          } catch {
            return href;
          }
        })()
      );
  if (isBoothDesktopInAppPath(path)) {
    await gotoFn(href);
    return;
  }
  const external = boothDesktopExternalPlaygroundUrl(href);
  if (external) {
    await boothDesktopOpenExternal(external);
    return;
  }
  await gotoFn("/room");
}

export function installBoothDesktopNavigationGuards(): void {
  if (!isBoothDesktopShell() || typeof document === "undefined") return;
  document.documentElement.dataset.boothDesktop = "1";

  const onLinkClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (!href) return;
    const external = boothDesktopExternalPlaygroundUrl(href);
    if (!external) return;
    event.preventDefault();
    event.stopPropagation();
    void boothDesktopOpenExternal(external);
  };

  document.addEventListener("click", onLinkClick, true);
}
