/**
 * Web Share API when available; clipboard fallback (DEC-042 field share).
 * Must be called from a user gesture for `navigator.share`.
 */

export type SharePayload = {
  title: string;
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

/**
 * Prefer Web Share; on failure (except abort) or missing API, copy `url` only.
 */
export async function shareOrCopy(
  payload: SharePayload
): Promise<ShareOrCopyResult> {
  const url = payload.url.trim();
  if (!url) throw new Error("分享網址為空");

  const data: ShareData = {
    title: payload.title,
    url,
  };
  if (payload.text?.trim()) data.text = payload.text.trim();

  if (canUseWebShare()) {
    const okToShare =
      typeof navigator.canShare !== "function" || navigator.canShare(data);
    if (okToShare) {
      try {
        await navigator.share(data);
        return "shared";
      } catch (e) {
        if (isShareAbort(e)) throw e;
        // Fall through to clipboard.
      }
    }
  }

  await copyTextToClipboard(url);
  return "copied";
}
