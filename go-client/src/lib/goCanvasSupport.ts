/**
 * Detect whether go-client can use the canvas Service Worker.
 * Many in-app WebViews (LINE scanner, iOS WKWebView) expose a broken
 * `navigator.serviceWorker` stub — `"serviceWorker" in navigator` is not enough.
 */
export type GoBrowserMissing =
  | "localStorage"
  | "indexedDB"
  | "webassembly"
  | "serviceWorker";

export interface GoBrowserSupport {
  /** True only when every required API is present. */
  supported: boolean;
  /** Subset of required APIs that are missing (also non-empty when unsupported). */
  missing: GoBrowserMissing[];
}

/** Required browser APIs for go-client games to run / persist. */
const REQUIRED: ReadonlyArray<GoBrowserMissing> = [
  "localStorage",
  "indexedDB",
  "webassembly",
  "serviceWorker",
];

function hasLocalStorage(): boolean {
  try {
    return (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function" &&
      typeof localStorage.setItem === "function"
    );
  } catch {
    // Accessing localStorage can throw in some sandboxed/private contexts.
    return false;
  }
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

function hasWebAssembly(): boolean {
  return typeof WebAssembly !== "undefined";
}

export function goBrowserSupports(): GoBrowserSupport {
  const missing: GoBrowserMissing[] = [];
  if (!hasLocalStorage()) missing.push("localStorage");
  if (!hasIndexedDB()) missing.push("indexedDB");
  if (!hasWebAssembly()) missing.push("webassembly");
  if (!isGoCanvasSwUsable()) missing.push("serviceWorker");
  return { supported: missing.length === 0, missing };
}

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
    return "目前的 App 內建瀏覽器無法載入遊戲畫面。請用系統瀏覽器開啟此連結（iPhone：右上角⋯ → 在 Safari 開啟）。";
  }
  return "此瀏覽器無法載入遊戲畫面（缺少 Service Worker）。請改用 Safari 或 Chrome 開啟邀請連結。";
}

const MISSING_LABEL: Record<GoBrowserMissing, string> = {
  localStorage: "localStorage",
  indexedDB: "IndexedDB",
  webassembly: "WebAssembly",
  serviceWorker: "Service Worker",
};

export function goBrowserUnsupportedMessage(
  support: GoBrowserSupport
): string | null {
  if (support.supported) return null;
  const list = support.missing
    .map(m => MISSING_LABEL[m])
    .join("、");
  if (likelyInAppBrowser()) {
    return `目前的 App 內建瀏覽器缺少 ${list}，無法載入遊戲。請用系統瀏覽器開啟此連結（iPhone：右上角⋯ → 在 Safari 開啟）。`;
  }
  return `此瀏覽器缺少 ${list}，無法順暢運行遊戲。請改用 Safari 或 Chrome 開啟純玩首頁。`;
}

