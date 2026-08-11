/**
 * Map SSO `auth_error` codes (from `dashErrorRedirect`) to user-facing
 * messages. Kept in one place so the login page and the join landing can
 * render specific guidance instead of a generic "進入失敗".
 */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  need_invite_or_link:
    "這個登入方式尚未關聯到任何帳戶。若你之前已註冊，請先以另一種方式登入並在「帳號」頁連結；否則請使用管理員提供的註冊邀請。",
  forbidden: "你的帳戶目前無法進入後台。",
  user_not_found: "找不到對應的使用者帳戶。",
  invite_not_found: "找不到這份註冊邀請。",
  invite_gone: "這份註冊邀請已過期或已使用。",
  not_found: "找不到這份註冊邀請。",
  gone: "這份註冊邀請已過期。",
  already_used: "這份註冊邀請已經使用過了。",
  line_already_linked:
    "這個 LINE 帳號已連結到其他帳戶。請以既有方式登入，或先在「帳號」頁處理連結狀態。",
  google_already_linked:
    "這個 Google 帳號已連結到其他帳戶。請以既有方式登入，或先在「帳號」頁處理連結狀態。",
  github_already_linked:
    "這個 GitHub 帳號已連結到其他帳戶。請以既有方式登入，或先在「帳號」頁處理連結狀態。",
  admin_line_mismatch:
    "第一次設定失敗：LINE 身分與既有管理者不一致。請改以 GitHub 試試，或只用未連結的身分完成設定。",
  admin_google_mismatch:
    "第一次設定失敗：Google 身分與既有管理者不一致。請改以 GitHub 試試。",
  admin_github_mismatch:
    "第一次設定失敗：GitHub 身分與既有管理者不一致。",
  unauthorized: "沒有權限完成這個動作。",
  missing_code: "缺少授權碼，請重新嘗試登入。",
  invalid_state: "登入狀態已過期，請重新嘗試登入。",
  token_exchange_failed:
    "無法完成登入驗證（向提供者換取憑證失敗）。請再試一次。",
  github_user_failed: "無法讀取 GitHub 身分資料，請再試一次。",
  google_user_failed: "無法讀取 Google 身分資料，請再試一次。",
  line_user_failed: "無法讀取 LINE 身分資料，請再試一次。",
  unknown_intent: "登入請求無法辨識，請重新嘗試登入。",
  github_oauth_not_configured: "GitHub 登入尚未設定完成，請稍後再試。",
  google_oauth_not_configured: "Google 登入尚未設定完成，請稍後再試。",
  line_oauth_not_configured: "LINE 登入尚未設定完成，請稍後再試。",
};

export const DEFAULT_AUTH_ERROR_MESSAGE = "進入失敗，請再試一次。";

export function authErrorMessage(code: string | null): {
  message: string;
  known: boolean;
} {
  if (!code) return { message: DEFAULT_AUTH_ERROR_MESSAGE, known: false };
  const msg = AUTH_ERROR_MESSAGES[code];
  if (!msg) return { message: DEFAULT_AUTH_ERROR_MESSAGE, known: false };
  return { message: msg, known: true };
}