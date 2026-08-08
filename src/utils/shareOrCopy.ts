/**
 * Web Share API when available; clipboard fallback (DEC-042 field share).
 * Must be called from a user gesture for `navigator.share`.
 *
 * When `url` is set, Web Share omits `text`: many share targets concatenate
 * `url`+`text` (often with no separator), which breaks open／deep links.
 * Put a short label in `title` instead; clipboard fallback still copies `url` only.
 */

export type SharePayload = {
  title: string;
  /**
   * Optional note for callers／docs. Ignored by Web Share when `url` is set
   * (see module note). Not copied to clipboard.
   */
  text?: string;
  /** Absolute URL required for system share sheets. */
  url: string;
};

export type ShareOrCopyResult = "shared" | "copied";

/** True when the UA exposes `navigator.share` (secure context). */
export function canUseWebShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

/** User dismissed the share sheet — not an error; do not fall back to clipboard. */
export function isShareAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error("無法寫入剪貼簿");
}

/** Clipboard-only: copy absolute `url` (share-sheet「複製連結」). */
export async function copyShareUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("分享網址為空");
  await copyTextToClipboard(trimmed);
}

/**
 * Web Share only (`title`＋`url`). Throws `AbortError` on cancel; throws if
 * share unavailable or fails — callers keep a QR／copy fallback (go §5.5).
 */
export async function shareViaWebShare(payload: SharePayload): Promise<void> {
  const url = payload.url.trim();
  if (!url) throw new Error("分享網址為空");
  if (!canUseWebShare()) throw new Error("此瀏覽器不支援系統分享");

  const data: ShareData = {
    title: payload.title.trim() || url,
    url,
  };
  if (typeof navigator.canShare === "function" && !navigator.canShare(data)) {
    throw new Error("此內容無法透過系統分享");
  }
  await navigator.share(data);
}

/**
 * Prefer Web Share; on failure (except abort) or missing API, copy `url` only.
 */
export async function shareOrCopy(
  payload: SharePayload
): Promise<ShareOrCopyResult> {
  const url = payload.url.trim();
  if (!url) throw new Error("分享網址為空");

  if (canUseWebShare()) {
    try {
      await shareViaWebShare(payload);
      return "shared";
    } catch (e) {
      if (isShareAbort(e)) throw e;
      // Fall through to clipboard.
    }
  }

  await copyShareUrl(url);
  return "copied";
}
