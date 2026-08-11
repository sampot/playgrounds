/**
 * Shared dashboard state (runes-based) + bootstrap.
 * Replaces the old single-page tab model: auth, flash, confirm dialog and the
 * SSO/session bootstrap now live here so each route page can use them.
 */
import {
  api,
  getAccessToken,
  setAccessToken,
  type AdminUser,
  type CreditSessionRow,
  type Me,
} from "./api";
import { authErrorMessage } from "./authErrors";

export type ConfirmState = {
  title: string;
  message: string;
  confirmLabel?: string;
  requireCheck?: boolean;
  checkLabel?: string;
  action: () => Promise<void>;
} | null;

const RETURN_FIELD_KEY = "pg_dash_return_field";

class DashStore {
  me = $state<Me | null>(null);
  flashMsg = $state("");
  flashKind = $state<"ok" | "warn" | "err">("ok");
  users = $state<AdminUser[]>([]);
  confirm = $state<ConfirmState>(null);
  busy = $state(false);
  creditSessions = $state<CreditSessionRow[]>([]);
  returnFieldHint = $state("");

  isAdmin = $derived(this.me?.role === "admin");
  ssoCount = $derived(
    (this.me?.github ? 1 : 0) + (this.me?.google ? 1 : 0) + (this.me?.line ? 1 : 0)
  );

  flash(msg: string, kind: "ok" | "warn" | "err" = "ok") {
    this.flashMsg = msg;
    this.flashKind = kind;
  }

  clearFlash() {
    this.flashMsg = "";
  }

  askConfirm(next: ConfirmState) {
    this.confirm = next;
  }

  stashReturnField(origin: string) {
    const v = origin.trim();
    if (!v) return;
    try {
      sessionStorage.setItem(RETURN_FIELD_KEY, v);
    } catch {
      /* ignore */
    }
    this.returnFieldHint = v;
  }

  peekReturnField(): string {
    try {
      return sessionStorage.getItem(RETURN_FIELD_KEY) || this.returnFieldHint || "";
    } catch {
      return this.returnFieldHint || "";
    }
  }

  takeReturnField(): string {
    const v = this.peekReturnField();
    try {
      sessionStorage.removeItem(RETURN_FIELD_KEY);
    } catch {
      /* ignore */
    }
    this.returnFieldHint = "";
    return v;
  }

  async refreshMe(): Promise<boolean> {
    const { res, data } = await api<Me & { error?: string }>("/v1/me");
    if (!res.ok) {
      this.setLoggedOut();
      return false;
    }
    this.me = data;
    void this.loadCreditSessions();
    return true;
  }

  setLoggedOut() {
    setAccessToken(null);
    this.me = null;
  }

  async loadCreditSessions() {
    const { res, data } = await api<{ sessions?: CreditSessionRow[] }>(
      "/v1/me/credits/sessions"
    );
    this.creditSessions = res.ok ? data.sessions || [] : [];
  }

  async loadUsers() {
    if (!this.isAdmin) return;
    const { res, data } = await api<{ users: AdminUser[]; error?: string }>(
      "/v1/admin/users"
    );
    if (!res.ok) {
      this.flash(data.error || "無法載入使用者列表", "err");
      return;
    }
    this.users = data.users || [];
  }

  async bootstrapSession(): Promise<void> {
    const params = new URLSearchParams(location.search);
    const fieldParam = params.get("field");
    if (fieldParam?.trim()) {
      this.stashReturnField(fieldParam);
      params.delete("field");
    }
    const session = params.get("session");
    const authError = params.get("auth_error");
    const linked = params.get("linked");
    const claimed = params.get("claimed");
    if (authError) {
      const { message } = authErrorMessage(authError);
      this.flash(message, "err");
    }

    if (session) {
      const { res, data } = await api<{ access_token?: string; error?: string }>(
        "/v1/auth/session",
        { method: "POST", body: JSON.stringify({ session }) }
      );
      if (res.ok && data.access_token) {
        setAccessToken(data.access_token);
        this.flash("已進入後台", "ok");
      } else {
        this.flash("無法完成進入，請再試一次", "err");
      }
      params.delete("session");
    }

    params.delete("linked");
    params.delete("claimed");
    params.delete("auth_error");
    const qs = params.toString();
    const next = qs ? `/?${qs}` : "/";
    if (location.search || fieldParam) history.replaceState({}, "", next);

    this.returnFieldHint = this.peekReturnField();

    if (getAccessToken()) {
      const ok = await this.refreshMe();
      if (ok) {
        if (linked) this.flash("已連結登入方式", "ok");
        else if (claimed) this.flash("註冊完成", "ok");
        if (this.me?.role === "admin") await this.loadUsers();
        const ret = this.peekReturnField();
        if (ret) {
          this.flash("正在回到你的遊樂場…", "ok");
          await this.provisionAndOpenField(ret, { skipConfirm: true });
        }
      }
    }
  }

  async provisionAndOpenField(
    targetField: string | null,
    opts: { skipConfirm?: boolean } = {}
  ) {
    const run = async () => {
      this.busy = true;
      try {
        const body =
          targetField && targetField.trim()
            ? JSON.stringify({ target_field: targetField.trim() })
            : "{}";
        const { res, data } = await api<{ field_url?: string; error?: string }>(
          "/v1/field/provision",
          { method: "POST", body }
        );
        if (!res.ok || !data.field_url) {
          this.flash(
            data.error === "invalid_target_field"
              ? "遊樂場網址無效"
              : "無法登入場，請稍後再試",
            "err"
          );
          return;
        }
        this.takeReturnField();
        await this.refreshMe();
        this.flash("正在開啟遊樂場…", "ok");
        window.location.assign(data.field_url);
      } finally {
        this.busy = false;
      }
    };

    if (opts.skipConfirm) {
      await run();
      return;
    }
    this.askConfirm({
      title: "登入我的遊樂場",
      message:
        "會更換通行證，同一時間只能登入一個遊樂場；其他已開啟的場會立刻失效。關閉遊樂場頁面後需再登入。",
      confirmLabel: "登入並開啟",
      action: run,
    });
  }

  async runConfirm() {
    const action = this.confirm?.action;
    this.confirm = null;
    if (!action) return;
    this.busy = true;
    try {
      await action();
    } finally {
      this.busy = false;
    }
  }
}

export const dash = new DashStore();
