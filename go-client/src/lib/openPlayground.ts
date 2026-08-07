/**
 * Open the official field (play) — prefer system browser when the host allows.
 * Best-effort WebView escape; never guaranteed (DEC-050 §6.4).
 *
 * Important: many in-app browsers (LINE etc.) return a non-null stub from
 * `window.open` that never navigates. Always preventing default then
 * trusting that stub makes the link appear dead until luck hits.
 */
export const PLAY_ORIGIN = "https://play.samkuo.me";

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
 * Click handler for play links. Only suppress default navigation when a
 * real popup opened; otherwise let the `<a href>` navigate normally.
 */
export function openPlaygroundHome(event?: MouseEvent): void {
  if (!event) {
    window.location.assign(`${PLAY_ORIGIN}/`);
    return;
  }
  // Let modified clicks use native browser behaviour.
  if (event.defaultPrevented) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (event.button != null && event.button !== 0) return;

  const href = `${PLAY_ORIGIN}/`;
  let opened: Window | null = null;
  try {
    opened = window.open(href, "_blank", "noopener,noreferrer");
  } catch {
    opened = null;
  }
  if (popupLooksReal(opened)) {
    event.preventDefault();
    return;
  }
  // Do not preventDefault — follow href (same tab or WebView's own handling).
}
