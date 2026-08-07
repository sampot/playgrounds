/**
 * Browser storage / OPFS failure helpers.
 * Safari Private Browsing and some in-app WebViews reject OPFS with a misleading
 * "out of memory" / "unknown transient reason" UnknownError.
 */

export function isTransientStorageError(error: unknown): boolean {
  const name =
    error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : "";
  const msg = error instanceof Error ? error.message : String(error);
  if (name === "UnknownError") return true;
  if (/unknown transient reason/i.test(msg)) return true;
  if (/failed to create swap file/i.test(msg)) return true;
  return false;
}

/** Short zh hint for invite／open UX when OPFS／quota rejects. */
export function transientStorageHint(): string {
  return "提示：請用系統 Safari 或 Chrome 開啟（關閉無痕／私人模式）；若剛用相機掃碼進入，可在位址列確認為 play.samkuo.me 後重新整理再試。iPhone 請更新至較新 iOS。";
}
