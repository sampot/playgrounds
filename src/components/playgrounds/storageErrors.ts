/**
 * Browser storage / OPFS failure helpers.
 * Safari Private Browsing and some in-app / scanner WebViews reject OPFS with a
 * misleading "out of memory" / "unknown transient reason" UnknownError.
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

/**
 * True when Guest invite open failed because this browsing context cannot
 * persist OPFS (scanner preview, private mode, etc.).
 */
export function isInviteStorageRestrictedError(error: unknown): boolean {
  if (isTransientStorageError(error)) return true;
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /無法寫入本機沙盒|無法存本機沙盒|本機沙盒儲存/i.test(msg) ||
    /OPFS|createWritable|SyncAccessHandle/i.test(msg) ||
    /out of memory/i.test(msg)
  );
}

/** Invite modal headline when storage is restricted. */
export const INVITE_STORAGE_RESTRICTED_TITLE = "此開啟方式無法存本機沙盒";

/** Short recovery line under the title. */
export const INVITE_STORAGE_RESTRICTED_LEAD = "請用 Safari 開啟";
