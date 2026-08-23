/**
 * Map technical fetch／offline／GitHub failures to plain-language copy for go users
 * (DEC-050 — no SaaS／devtools tone; never surface HTTP status codes).
 */

export function isLikelyOffline(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

function errText(err: unknown): string {
  if (err instanceof Error) return err.message || "";
  if (typeof err === "string") return err;
  return String(err ?? "");
}

/** Rate limit／blocked／forbidden style failures (often GitHub API 403). */
export function isLikelyRateLimited(err: unknown): boolean {
  const msg = errText(err);
  const lower = msg.toLowerCase();
  return (
    /\b403\b/.test(msg) ||
    /\b429\b/.test(msg) ||
    /rate\s*limit/i.test(msg) ||
    /api rate/i.test(msg) ||
    /二次驗證|abuse|forbidden/i.test(lower) ||
    /無法讀取儲存庫/.test(msg) ||
    /無法列出檔案樹/.test(msg) ||
    /無法解析提交/.test(msg)
  );
}

export function isLikelyNetworkFailure(err: unknown): boolean {
  if (isLikelyOffline()) return true;
  if (isLikelyRateLimited(err)) return true;
  const msg = errText(err);
  const lower = msg.toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("internet connection") ||
    lower.includes("offline") ||
    lower.includes("net::err_") ||
    lower.includes("fetch failed") ||
    /下載失敗/.test(msg) ||
    /暫時連不上|連線失敗|無法下載/.test(msg) ||
    /http\s*\d{3}/i.test(msg) ||
    (err instanceof TypeError &&
      (lower.includes("fetch") ||
        lower.includes("network") ||
        lower.includes("load")))
  );
}

/** Messages safe to show as-is (already plain zh, no status codes／paths／APIs). */
function isSafeUserCopy(msg: string): boolean {
  const t = msg.trim();
  if (!t) return false;
  if (looksTechnical(t)) return false;
  // Allow short Chinese product copy we throw on purpose.
  return /[\u4e00-\u9fff]/.test(t);
}

function looksTechnical(msg: string): boolean {
  if (!msg.trim()) return true;
  if (/http\s*\d{3}/i.test(msg)) return true;
  if (/\b(403|404|410|429|500|502|503)\b/.test(msg)) return true;
  if (/failed to fetch|typeerror|networkerror|net::err_/i.test(msg)) {
    return true;
  }
  if (/api\.github|githubusercontent|jsdelivr|codeload|rate\s*limit/i.test(msg)) {
    return true;
  }
  if (/無法列出檔案樹|無法讀取儲存庫|無法解析提交|下載失敗：/.test(msg)) {
    return true;
  }
  if (/index\.html|filemap|sandboxid|cors/i.test(msg)) return true;
  // English-only engine／API messages — don't show raw to readers.
  if (/^[A-Za-z0-9]/.test(msg) && /[A-Za-z]{3,}/.test(msg)) return true;
  if (/[_/\\]{2,}|\.js\b|\.ts\b|stack|exception/i.test(msg)) return true;
  return false;
}

function withTitle(
  title: string | null | undefined,
  withName: (name: string) => string,
  without: string
): string {
  const name = title?.trim();
  return name ? withName(name) : without;
}

/** Solo `/s/<id>` load failure (no cache, or mount failed). */
export function friendlySoloLoadError(
  err: unknown,
  entryTitle?: string | null
): string {
  if (isLikelyOffline()) {
    return withTitle(
      entryTitle,
      name =>
        `現在沒有網路，而且「${name}」還沒存到這台裝置。請連線後再開一次，之後就能離線玩。`,
      "現在沒有網路，而且這顆小品還沒存到這台裝置。請連線後再開一次，之後就能離線玩。"
    );
  }
  if (isLikelyRateLimited(err)) {
    return withTitle(
      entryTitle,
      name => `現在有點多人在開「${name}」，請稍後再試一次。`,
      "現在開啟的人有點多，請稍後再試一次。"
    );
  }
  if (isLikelyNetworkFailure(err)) {
    return withTitle(
      entryTitle,
      name => `暫時連不上「${name}」。請確認網路後再試一次。`,
      "暫時連不上。請確認網路後再試一次。"
    );
  }

  const raw = errText(err);
  if (/缺少 index\.html|小品缺少/i.test(raw)) {
    return withTitle(
      entryTitle,
      name => `「${name}」檔案不完整，暫時打不開。`,
      "這顆小品檔案不完整，暫時打不開。"
    );
  }
  if (/無法解析小品來源/.test(raw)) {
    return withTitle(
      entryTitle,
      name => `找不到「${name}」的來源，請稍後再試。`,
      "找不到這顆小品的來源，請稍後再試。"
    );
  }
  if (isSafeUserCopy(raw)) return raw;
  return withTitle(
    entryTitle,
    name => `打不開「${name}」，請稍後再試。`,
    "打不開這顆小品，請稍後再試。"
  );
}

/** Invite resolve／join network failures. */
export function friendlyInviteError(err: unknown, prefix?: string): string {
  const raw = errText(err);
  const lower = raw.toLowerCase();

  if (lower === "anchor_offline" || lower.includes("anchor_offline")) {
    return "主持暫時不在線上。請稍後再試，或請主持確認包廂還開著。";
  }
  if (lower === "timeout" || lower.includes("timeout")) {
    return "進門逾時。主持可能忙碌中，請稍後再試。";
  }

  if (isLikelyOffline()) {
    return "現在沒有網路，無法加入。邀請需要連線才能進入這一場。";
  }
  if (isLikelyRateLimited(err)) {
    return "現在連線的人有點多，請稍後再試一次。";
  }
  if (isLikelyNetworkFailure(err)) {
    return "暫時連不上邀請服務。請確認網路後再試一次。";
  }

  // Already-friendly invite domain errors (no HTTP noise).
  if (
    isSafeUserCopy(raw) &&
    /邀請|入座|座位|主持|短碼|撤銷|過期|關閉/.test(raw)
  ) {
    return prefix ? `${prefix}：${raw}` : raw;
  }
  if (looksTechnical(raw) || !isSafeUserCopy(raw)) {
    return prefix ? `${prefix}，請稍後再試。` : "暫時無法加入，請稍後再試。";
  }
  return prefix ? `${prefix}：${raw}` : raw;
}

/** Booth operator remote connect failures. */
export function friendlyOperatorError(err: unknown): string {
  if (isLikelyOffline()) {
    return "現在沒有網路，無法連回包廂。請連線後再試。";
  }

  const raw = errText(err);
  const lower = raw.toLowerCase();

  if (
    lower === "ws_failed" ||
    lower === "ws_missing" ||
    /websocket|wss?:/i.test(raw)
  ) {
    return "暫時連不上包廂。請確認網路後，從後台重新「連回包廂」。";
  }

  if (
    lower === "unauthorized" ||
    /^operator_cap_/.test(lower) ||
    /^anchor_/.test(lower) ||
    /invalid.*cap|cap.*expired/i.test(lower)
  ) {
    return "連結已過期或無效。請從後台重新「連回包廂」。";
  }

  if (lower === "remote_disabled" || /remote_disabled/.test(lower)) {
    return "主持已關閉遠端連回。請在家裡包廂設定中開啟後再試。";
  }

  if (
    lower === "engine_offline" ||
    lower === "operator_hello_timeout" ||
    /engine_offline/.test(lower) ||
    /operator_hello_timeout/.test(lower)
  ) {
    return "家裡包廂未連線。請確認包廂分頁仍開啟、保持作用中，且已開啟「允許遠端連回包廂」。";
  }

  if (isLikelyRateLimited(err)) {
    return "現在連線的人有點多，請稍後再試一次。";
  }

  if (isLikelyNetworkFailure(err)) {
    return "暫時連不上包廂。請確認網路後再試一次。";
  }

  if (isSafeUserCopy(raw) && /包廂|連回|導播|離線|後台/.test(raw)) {
    return raw;
  }

  if (looksTechnical(raw) || !isSafeUserCopy(raw)) {
    return "暫時無法連回包廂，請稍後再試。";
  }

  return raw;
}

/** Operator intent ack errors (booth.ack error codes). */
export function friendlyOperatorAckError(code?: string | null): string {
  const c = code?.trim().toLowerCase() ?? "";
  if (!c) return "操作失敗，請再試一次。";
  if (c === "not_director") {
    return "目前僅能檢視，無法操作（家裡主持使用中）";
  }
  if (c === "invalid_intent") return "無法執行此操作";
  if (c === "missing_peer") return "找不到這位來賓";
  if (isSafeUserCopy(code ?? "")) return code!.trim();
  return "操作失敗，請再試一次。";
}

/** Invite path: SAM source download (not the same as solo offline cache). */
export function friendlySamDownloadError(err: unknown): string {
  if (isLikelyOffline()) {
    return "現在沒有網路，無法下載小品。請連線後再試。";
  }
  if (isLikelyRateLimited(err)) {
    return "現在下載的人有點多，請稍後再試一次。";
  }
  if (isLikelyNetworkFailure(err)) {
    return "暫時下載不了小品。請確認網路後再試一次。";
  }
  const raw = errText(err);
  if (/缺少 index\.html|小品缺少/i.test(raw)) {
    return "這顆小品檔案不完整，暫時打不開。";
  }
  if (isSafeUserCopy(raw)) return raw;
  return "打不開這顆小品，請稍後再試。";
}
