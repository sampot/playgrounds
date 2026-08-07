/**
 * Detect whether go-client can use the canvas Service Worker.
 * Many in-app WebViews (LINE scanner, iOS WKWebView) expose a broken
 * `navigator.serviceWorker` stub — `"serviceWorker" in navigator` is not enough.
 */

export function isGoCanvasSwUsable(): boolean {
  try {
    if (!("serviceWorker" in navigator)) return false;
    const sw = navigator.serviceWorker;
    if (!sw || typeof sw !== "object") return false;
    if (typeof sw.register !== "function") return false;
    if (typeof sw.addEventListener !== "function") return false;
    if (typeof sw.ready === "undefined") return false;
    return true;
  } catch {
    return false;
  }
}

/** Best-effort hint for recovery copy (not used for capability checks). */
export function likelyInAppBrowser(): boolean {
  try {
    const ua = navigator.userAgent || "";
    return /Line\//i.test(ua) || /FBAN|FBAV/i.test(ua) || /Instagram/i.test(ua);
  } catch {
    return false;
  }
}

export function goCanvasSwUnavailableMessage(): string {
  if (likelyInAppBrowser()) {
    return "目前的 App 內建瀏覽器無法載入對弈畫面。請用系統瀏覽器開啟此連結（iPhone：右上角⋯ → 在 Safari 開啟）。";
  }
  return "此瀏覽器無法載入對弈畫面（缺少 Service Worker）。請改用 Safari 或 Chrome 開啟邀請連結。";
}
