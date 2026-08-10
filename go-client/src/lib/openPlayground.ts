/**
 * Open the official field (play) — prefer system browser when the host allows.
 * Best-effort WebView escape; never guaranteed (DEC-050 §6.4).
 *
 * Important: many in-app browsers (LINE etc.) return a non-null stub from
 * `window.open` that never navigates. Always preventing default then
 * trusting that stub makes the link appear dead until luck hits.
 */
export const PLAY_ORIGIN = "https://play.samkuo.me";

/**
 * Field SAM catalog filtered to games — chrome「山姆鍋遊樂場」主連.
 * Query 契約：`?kind=`（見 PG-CATALOG-UX-PLAN／`catalogUrlSearchParams`）；
 * `from=go`＝一鍵開走純玩 `/s/<id>`（非場 `/?open=`）。
 */
export const PLAY_CATALOG_HREF = `${PLAY_ORIGIN}/sam/?kind=game&from=go`;

function popupLooksReal(w: Window | null): boolean {
  if (!w || w === window) return false;
  try {
    // Real popups expose boolean `closed`. Some stubs omit it or throw.
    if (typeof w.closed !== "boolean") return false;
    if (w.closed) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Click handler for external play links. Only suppress default navigation when a
 * real popup opened; otherwise let the `<a href>` navigate normally.
 */
export function openPlaygroundUrl(href: string, event?: MouseEvent): void {
  const target = href.trim() || `${PLAY_ORIGIN}/`;
  if (!event) {
    window.location.assign(target);
    return;
  }
  // Let modified clicks use native browser behaviour.
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.button != null && event.button !== 0) return;

  let opened: Window | null = null;
  try {
    opened = window.open(target, "_blank", "noopener,noreferrer");
  } catch {
    opened = null;
  }
  if (popupLooksReal(opened)) {
    event.preventDefault();
    return;
  }
  // Do not preventDefault — follow href (same tab or WebView's own handling).
}

/** Field home `/`. */
export function openPlaygroundHome(event?: MouseEvent): void {
  openPlaygroundUrl(`${PLAY_ORIGIN}/`, event);
}

/** Field catalog `/sam/`（小品型錄）. */
export function openPlaygroundCatalog(event?: MouseEvent): void {
  openPlaygroundUrl(PLAY_CATALOG_HREF, event);
}
