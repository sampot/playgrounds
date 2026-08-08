/**
 * Map technical fetch／offline failures to plain-language copy for go users
 * (DEC-050 — no SaaS／devtools tone).
 */

export function isLikelyOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

export function isLikelyNetworkFailure(err: unknown): boolean {
  if (isLikelyOffline()) return true;
  const msg = (
    err instanceof Error ? err.message : String(err ?? "")
  ).toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("internet connection") ||
    msg.includes("offline") ||
    msg.includes("net::err_") ||
    msg.includes("fetch failed") ||
    (err instanceof TypeError &&
      (msg.includes("fetch") || msg.includes("network") || msg.includes("load")))
  );
}

function looksTechnical(msg: string): boolean {
  if (!msg.trim()) return true;
  if (/failed to fetch|typeerror|networkerror|net::err_/i.test(msg)) {
    return true;
  }
  // English-only engine messages — don't show raw to readers.
  if (/^[A-Za-z0-9]/.test(msg) && /[A-Za-z]{3,}/.test(msg)) return true;
  return false;
}

/** Solo `/s/<id>` load failure (no cache, or mount failed). */
export function friendlySoloLoadError(
  err: unknown,
  entryTitle?: string | null
): string {
  const name = entryTitle?.trim();
  if (isLikelyNetworkFailure(err)) {
    if (isLikelyOffline()) {
      return name
        ? `現在沒有網路，而且「${name}」還沒存到這台裝置。請連線後再開一次，之後就能離線玩。`
        : "現在沒有網路，而且這顆小品還沒存到這台裝置。請連線後再開一次，之後就能離線玩。";
    }
    return name
      ? `暫時連不上「${name}」。請確認網路後再試一次。`
      : "暫時連不上。請確認網路後再試一次。";
  }
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (looksTechnical(raw)) {
    return name
      ? `打不開「${name}」，請稍後再試。`
      : "打不開這顆小品，請稍後再試。";
  }
  return raw;
}

/** Invite resolve／join network failures. */
export function friendlyInviteError(err: unknown, prefix?: string): string {
  if (isLikelyNetworkFailure(err)) {
    if (isLikelyOffline()) {
      return "現在沒有網路，無法加入。邀請需要連線才能進入這一場。";
    }
    return "暫時連不上邀請服務。請確認網路後再試一次。";
  }
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (looksTechnical(raw)) {
    return prefix ? `${prefix}，請稍後再試。` : "暫時無法加入，請稍後再試。";
  }
  return prefix ? `${prefix}：${raw}` : raw;
}

/** Invite path: SAM source download (not the same as solo offline cache). */
export function friendlySamDownloadError(err: unknown): string {
  if (isLikelyNetworkFailure(err)) {
    if (isLikelyOffline()) {
      return "現在沒有網路，無法下載小品。請連線後再試。";
    }
    return "暫時下載不了小品。請確認網路後再試一次。";
  }
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (looksTechnical(raw)) {
    return "打不開這顆小品，請稍後再試。";
  }
  return raw;
}
