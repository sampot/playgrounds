/**
 * Open the official field (play) — prefer system browser when the host allows.
 * Best-effort WebView escape; never guaranteed (DEC-050 §6.4).
 */
export const PLAY_ORIGIN = "https://play.samkuo.me";

export function openPlaygroundHome(event?: MouseEvent): void {
  event?.preventDefault();
  const href = `${PLAY_ORIGIN}/`;
  try {
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (w) return;
  } catch {
    /* fall through */
  }
  window.location.assign(href);
}
