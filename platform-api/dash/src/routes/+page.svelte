<script lang="ts">
  import { onMount } from "svelte";
  import Flash from "$lib/components/Flash.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import {
    api,
    copyText,
    formatTime,
    getAccessToken,
    setAccessToken,
    type AdminUser,
    type CreditSessionRow,
    type Me,
  } from "$lib/api";

  type Tab = "account" | "field" | "ops";
  type ConfirmState = {
    title: string;
    message: string;
    confirmLabel?: string;
    requireCheck?: boolean;
    checkLabel?: string;
    action: () => Promise<void>;
  } | null;

  let me = $state<Me | null>(null);
  let tab = $state<Tab>("field");
  let flashMsg = $state("");
  let flashKind = $state<"ok" | "warn" | "err">("ok");
  let regInviteUrl = $state("");
  let users = $state<AdminUser[]>([]);
  let confirm = $state<ConfirmState>(null);
  let busy = $state(false);
  let defaultFieldDraft = $state("https://play.samkuo.me");
  /** Field origin that asked to log in (from ?field=); stash across SSO. */
  let returnFieldHint = $state("");
  let creditSessions = $state<CreditSessionRow[]>([]);
  let topupDraft = $state<Record<string, string>>({});

  const RETURN_FIELD_KEY = "pg_dash_return_field";

  const isAdmin = $derived(me?.role === "admin");
  const ssoCount = $derived(
    (me?.github ? 1 : 0) + (me?.google ? 1 : 0)
  );

  function flash(msg: string, kind: "ok" | "warn" | "err" = "ok") {
    flashMsg = msg;
    flashKind = kind;
  }

  function askConfirm(next: ConfirmState) {
    confirm = next;
  }

  function stashReturnField(origin: string) {
    const v = origin.trim();
    if (!v) return;
    try {
      sessionStorage.setItem(RETURN_FIELD_KEY, v);
    } catch {
      /* ignore */
    }
    returnFieldHint = v;
  }

  function peekReturnField(): string {
    try {
      return sessionStorage.getItem(RETURN_FIELD_KEY) || returnFieldHint || "";
    } catch {
      return returnFieldHint || "";
    }
  }

  function takeReturnField(): string {
    const v = peekReturnField();
    try {
      sessionStorage.removeItem(RETURN_FIELD_KEY);
    } catch {
      /* ignore */
    }
    returnFieldHint = "";
    return v;
  }

  async function refreshMe() {
    const { res, data } = await api<Me & { error?: string }>("/v1/me");
    if (!res.ok) {
      setAccessToken(null);
      me = null;
      return false;
    }
    me = data;
    defaultFieldDraft =
      data.default_field_url || "https://play.samkuo.me";
    void loadCreditSessions();
    return true;
  }

  async function loadCreditSessions() {
    const { res, data } = await api<{
      sessions?: CreditSessionRow[];
    }>("/v1/me/credits/sessions");
    if (!res.ok) {
      creditSessions = [];
      return;
    }
    creditSessions = data.sessions || [];
  }

  async function loadUsers() {
    if (!isAdmin) return;
    const { res, data } = await api<{ users: AdminUser[]; error?: string }>(
      "/v1/admin/users"
    );
    if (!res.ok) {
      flash(data.error || "無法載入使用者列表", "err");
      return;
    }
    users = data.users || [];
  }

  async function setTurnPrefer(prefer: boolean) {
    if (!me) return;
    if (prefer && !me.turn_hosted) {
      flash("需管理者先開通連線備援資格", "warn");
      return;
    }
    busy = true;
    try {
      const { res, data } = await api<{
        turn_prefer?: boolean;
        error?: string;
      }>("/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ turn_prefer: prefer }),
      });
      if (!res.ok) {
        flash(
          data.error === "turn_not_entitled"
            ? "需管理者先開通連線備援資格"
            : data.error || "無法更新",
          "err"
        );
        return;
      }
      me = { ...me, turn_prefer: Boolean(data.turn_prefer) };
      flash(prefer ? "已啟用連線備援" : "已關閉連線備援", "ok");
    } finally {
      busy = false;
    }
  }

  async function adminAddCredits(userId: string) {
    const raw = (topupDraft[userId] || "").trim();
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 1 || !Number.isInteger(amount)) {
      flash("請輸入正整數點數", "warn");
      return;
    }
    busy = true;
    try {
      const { res, data } = await api<{ balance?: number; error?: string }>(
        `/v1/admin/users/${encodeURIComponent(userId)}/credits`,
        {
          method: "POST",
          body: JSON.stringify({ amount }),
        }
      );
      if (!res.ok) {
        flash(data.error || "加點失敗", "err");
        return;
      }
      topupDraft = { ...topupDraft, [userId]: "" };
      flash(`已加點，餘額 ${data.balance ?? "—"}`, "ok");
      await loadUsers();
      if (me?.user_id === userId) await refreshMe();
    } finally {
      busy = false;
    }
  }

  async function adminSetTurnHosted(userId: string, enabled: boolean) {
    askConfirm({
      title: enabled ? "開通連線備援" : "關閉連線備援",
      message: enabled
        ? "開通後，此使用者在點數足夠時可自動使用官方連線備援（對對弈者不顯示直連／轉發）。"
        : "關閉後，此使用者無法再取得官方連線備援。",
      confirmLabel: enabled ? "開通" : "關閉",
      action: async () => {
        const { res, data } = await api<{
          turn_hosted?: boolean;
          error?: string;
        }>(
          `/v1/admin/users/${encodeURIComponent(userId)}/entitlements/turn.hosted`,
          {
            method: "POST",
            body: JSON.stringify({ enabled }),
          }
        );
        if (!res.ok) {
          flash(data.error || "無法更新", "err");
          return;
        }
        flash(enabled ? "已開通連線備援" : "已關閉連線備援", "ok");
        await loadUsers();
        if (me?.user_id === userId) await refreshMe();
      },
    });
  }

  /** Provision and open a field. targetField overrides account default. */
  async function provisionAndOpenField(
    targetField: string | null,
    opts: { skipConfirm?: boolean } = {}
  ) {
    const run = async () => {
      busy = true;
      try {
        const body =
          targetField && targetField.trim()
            ? JSON.stringify({ target_field: targetField.trim() })
            : "{}";
        const { res, data } = await api<{
          field_url?: string;
          error?: string;
        }>("/v1/field/provision", { method: "POST", body });
        if (!res.ok || !data.field_url) {
          flash(
            data.error === "invalid_target_field"
              ? "遊樂場網址無效"
              : "無法登入場，請稍後再試",
            "err"
          );
          return;
        }
        takeReturnField();
        await refreshMe();
        flash("正在開啟遊樂場…", "ok");
        window.location.assign(data.field_url);
      } finally {
        busy = false;
      }
    };

    if (opts.skipConfirm) {
      await run();
      return;
    }
    askConfirm({
      title: "登入我的遊樂場",
      message:
        "會更換通行證，同一時間只能登入一個遊樂場；其他已開啟的場會立刻失效。關閉遊樂場頁面後需再登入。",
      confirmLabel: "登入並開啟",
      action: run,
    });
  }

  async function bootstrapSession() {
    const params = new URLSearchParams(location.search);
    const fieldParam = params.get("field");
    if (fieldParam?.trim()) {
      stashReturnField(fieldParam);
      params.delete("field");
    }
    const session = params.get("session");
    const authError = params.get("auth_error");
    const linked = params.get("linked");
    const claimed = params.get("claimed");
    if (authError) {
      flash("進入失敗，請再試一次", "err");
    }
    if (session) {
      const { res, data } = await api<{
        access_token?: string;
        error?: string;
      }>("/v1/auth/session", {
        method: "POST",
        body: JSON.stringify({ session }),
      });
      if (res.ok && data.access_token) {
        setAccessToken(data.access_token);
        flash("已進入後台", "ok");
      } else {
        flash("無法完成進入，請再試一次", "err");
      }
      params.delete("session");
    }
    // Drop consumed query keys from address bar
    {
      params.delete("linked");
      params.delete("claimed");
      params.delete("auth_error");
      const qs = params.toString();
      const next = qs ? `/?${qs}` : "/";
      if (location.search || fieldParam) {
        history.replaceState({}, "", next);
      }
    }

    returnFieldHint = peekReturnField();

    if (getAccessToken()) {
      const ok = await refreshMe();
      if (ok) {
        if (linked) flash("已連結登入方式", "ok");
        else if (claimed) flash("註冊完成", "ok");
        if (me?.role === "admin") await loadUsers();
        const ret = peekReturnField();
        if (ret) {
          flash("正在回到你的遊樂場…", "ok");
          await provisionAndOpenField(ret, { skipConfirm: true });
          return;
        }
      }
    }
  }

  onMount(() => {
    void bootstrapSession();
  });

  async function logout() {
    try {
      await api("/v1/auth/logout", { method: "POST", body: "{}" });
    } catch {
      /* ignore */
    }
    setAccessToken(null);
    me = null;
    flash("已登出", "ok");
  }

  async function loginToField() {
    const ret = peekReturnField();
    await provisionAndOpenField(ret || null, { skipConfirm: false });
  }

  async function saveDefaultField() {
    busy = true;
    try {
      const { res, data } = await api<{
        default_field_url?: string;
        error?: string;
      }>("/v1/me", {
        method: "PATCH",
        body: JSON.stringify({ default_field_url: defaultFieldDraft }),
      });
      if (!res.ok) {
        flash(
          data.error === "invalid_default_field_url"
            ? "網址無效（請用官方場如 play.samkuo.me）"
            : "儲存失敗，請稍後再試",
          "err"
        );
        return;
      }
      if (data.default_field_url) {
        defaultFieldDraft = data.default_field_url;
      }
      await refreshMe();
      flash("已儲存預設遊樂場", "ok");
    } finally {
      busy = false;
    }
  }

  async function revokeKey() {
    if (!me?.key) return;
    askConfirm({
      title: "撤銷通行證",
      message: "撤銷後，已登入的遊樂場將無法再發出邀請，直到再次「登入我的遊樂場」。",
      action: async () => {
        const { res } = await api<{ error?: string }>("/v1/keys", {
          method: "DELETE",
        });
        if (!res.ok) {
          flash("撤銷失敗，請稍後再試", "err");
          return;
        }
        await refreshMe();
        flash("已撤銷通行證", "ok");
      },
    });
  }

  async function unlink(provider: "github" | "google") {
    const label = provider === "github" ? "GitHub" : "Google";
    askConfirm({
      title: "解除連結",
      message: `解除後無法再用 ${label} 進入。請至少保留一種登入方式。`,
      action: async () => {
        const { res, data } = await api<{ error?: string }>(
          `/v1/me/sso/${provider}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          flash(
            data.error === "last_sso"
              ? "請至少保留一種登入方式"
              : "解除失敗，請稍後再試",
            "err"
          );
          return;
        }
        await refreshMe();
        flash("已解除連結", "ok");
      },
    });
  }

  async function deleteAccount() {
    askConfirm({
      title: "刪除我的帳戶",
      message:
        "刪除後無法再以此帳號進入後台；通行證也會失效。若要回來，需重新取得註冊邀請。",
      requireCheck: true,
      checkLabel: "我了解，確定刪除帳戶",
      confirmLabel: "刪除帳戶",
      action: async () => {
        const { res, data } = await api<{ error?: string }>("/v1/me", {
          method: "DELETE",
        });
        if (!res.ok) {
          flash(
            data.error === "last_admin"
              ? "請先請其他人接手後台管理，再刪除帳戶"
              : "刪除失敗，請稍後再試",
            "err"
          );
          return;
        }
        setAccessToken(null);
        me = null;
        flash("帳戶已刪除", "ok");
      },
    });
  }

  async function issueRegInvite() {
    busy = true;
    try {
      const { res, data } = await api<{ join_url?: string; error?: string }>(
        "/v1/admin/registration-invites",
        { method: "POST", body: "{}" }
      );
      if (!res.ok) {
        flash("發出失敗，請稍後再試", "err");
        return;
      }
      regInviteUrl = data.join_url || "";
      flash("已發出註冊邀請", "ok");
    } finally {
      busy = false;
    }
  }

  async function setDisabled(userId: string, disabled: boolean) {
    askConfirm({
      title: disabled ? "停用使用者" : "恢復使用者",
      message: disabled
        ? "停用後，對方將無法進入後台，遊樂場通行證也會失效。"
        : "恢復後，對方可再次進入後台並重新登入場。",
      action: async () => {
        const path = disabled ? "disable" : "enable";
        const { res, data } = await api<{ error?: string }>(
          `/v1/admin/users/${encodeURIComponent(userId)}/${path}`,
          { method: "POST", body: "{}" }
        );
        if (!res.ok) {
          const msg =
            data.error === "cannot_disable_self"
              ? "不能停用自己的帳號"
              : data.error === "last_admin"
                ? "請先請其他人接手後台管理，再停用此帳號"
                : "操作失敗，請稍後再試";
          flash(msg, "err");
          return;
        }
        await loadUsers();
        flash(disabled ? "已停用" : "已恢復", "ok");
      },
    });
  }

  async function runConfirm() {
    const action = confirm?.action;
    confirm = null;
    if (!action) return;
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
    }
  }

  function selectTab(next: Tab) {
    if (next === "ops" && !isAdmin) return;
    tab = next;
    if (next === "ops") void loadUsers();
  }
</script>

<svelte:head>
  <title>遊樂場後台 · 我是山姆鍋</title>
  <meta name="description" content="遊樂場後台：帳號與登入遊樂場。" />
</svelte:head>

<main class="main">
  <div class="hero">
    <h1>遊樂場</h1>
    <p>管理帳號，並從這裡登入你的遊樂場。用 GitHub 或 Google 進入即可。</p>
  </div>

  <Flash message={flashMsg} kind={flashKind} />

  {#if !me}
    <section>
      <div class="panel">
        <h2>進入</h2>
        {#if returnFieldHint}
          <p class="lede">
            登入成功後會回到你的遊樂場
            <span class="mono">{returnFieldHint}</span>
            。
          </p>
        {:else}
          <p class="lede">
            所有帳號由此進入。登入後會依權限顯示可用功能。
          </p>
        {/if}
        <div class="row">
          <a class="btn" href="/auth/github?intent=login">使用 GitHub 進入</a>
          <a class="btn secondary" href="/auth/google?intent=login"
            >使用 Google 進入</a
          >
        </div>
      </div>
    </section>
  {:else}
    <section>
      <div class="account-bar">
        <span class="chip">
          <span class="dot" aria-hidden="true"></span>
          <span class="mono">{me.user_id}</span>
          <span aria-hidden="true">·</span>
          <span>{me.role === "admin" ? "管理者" : "使用者"}</span>
          {#if me.github?.login}
            <span class="meta">@{me.github.login}</span>
          {/if}
          {#if me.google?.email}
            <span class="meta">{me.google.email}</span>
          {/if}
        </span>
        <button type="button" class="linkish" onclick={logout}>登出</button>
      </div>

      <div class="panel">
        <h2>登入我的遊樂場</h2>
        <p class="lede">
          取得通行證並開啟你的場。同一時間只能登入一個遊樂場；關閉頁面後需重新登入。
        </p>
        {#if returnFieldHint}
          <p class="meta">
            將開啟：<span class="mono">{returnFieldHint}</span>
          </p>
        {/if}
        <div class="row">
          <button type="button" disabled={busy} onclick={loginToField}
            >登入我的遊樂場</button
          >
        </div>
      </div>

      <div class="tabs" role="tablist" aria-label="後台區塊">
        <button
          type="button"
          class="tab"
          role="tab"
          aria-selected={tab === "field"}
          onclick={() => selectTab("field")}>遊樂場</button
        >
        <button
          type="button"
          class="tab"
          role="tab"
          aria-selected={tab === "account"}
          onclick={() => selectTab("account")}>帳號</button
        >
        {#if isAdmin}
          <button
            type="button"
            class="tab"
            role="tab"
            aria-selected={tab === "ops"}
            onclick={() => selectTab("ops")}>營運</button
          >
        {/if}
      </div>

      {#if tab === "account"}
        <div class="panel" role="tabpanel">
          <h2>登入方式</h2>
          <p class="lede">
            可連結多種登入方式，請至少保留一種。
          </p>
          <div class="user-list">
            <div class="user-row">
              <header>
                <strong>GitHub</strong>
                {#if me.github}
                  <span class="meta">@{me.github.login}</span>
                {:else}
                  <span class="badge">未連結</span>
                {/if}
              </header>
              <div class="row">
                {#if me.github}
                  <button
                    type="button"
                    class="secondary"
                    disabled={ssoCount <= 1 || busy}
                    onclick={() => unlink("github")}>解除連結</button
                  >
                {:else}
                  <a class="btn secondary" href="/auth/github?intent=link"
                    >連結 GitHub</a
                  >
                {/if}
              </div>
            </div>
            <div class="user-row">
              <header>
                <strong>Google</strong>
                {#if me.google}
                  <span class="meta">{me.google.email}</span>
                {:else}
                  <span class="badge">未連結</span>
                {/if}
              </header>
              <div class="row">
                {#if me.google}
                  <button
                    type="button"
                    class="secondary"
                    disabled={ssoCount <= 1 || busy}
                    onclick={() => unlink("google")}>解除連結</button
                  >
                {:else}
                  <a class="btn secondary" href="/auth/google?intent=link"
                    >連結 Google</a
                  >
                {/if}
              </div>
            </div>
          </div>
          {#if ssoCount <= 1}
            <p class="meta">至少須保留一個登入方式。</p>
          {/if}

          <div class="danger-zone">
            <h2>刪除帳戶</h2>
            <p class="lede">刪除後將無法再以此帳號進入後台。</p>
            <div class="row">
              <button
                type="button"
                class="danger"
                disabled={busy}
                onclick={deleteAccount}>刪除我的帳戶</button
              >
            </div>
          </div>
        </div>
      {/if}

      {#if tab === "field"}
        <div class="panel" role="tabpanel">
          <h2>預設遊樂場</h2>
          <p class="lede">
            「登入我的遊樂場」會開啟此網址（官方場如 play.samkuo.me）。
          </p>
          <label class="meta" for="default-field">預設網址</label>
          <input
            id="default-field"
            class="mono"
            type="url"
            bind:value={defaultFieldDraft}
            placeholder="https://play.samkuo.me"
          />
          <div class="row">
            <button
              type="button"
              class="secondary"
              disabled={busy}
              onclick={saveDefaultField}>儲存</button
            >
          </div>

          <h2>通行證狀態</h2>
          <p class="lede">
            通行證只存在開啟中的遊樂場頁面；此處僅顯示狀態，不會顯示完整內容。
          </p>
          {#if me.key}
            <p class="mono">{me.key.prefix}…</p>
            <p class="meta">{formatTime(me.key.created_at)}</p>
          {:else}
            <p class="meta">尚未登入場</p>
          {/if}
          <div class="row">
            <button type="button" disabled={busy} onclick={loginToField}
              >登入我的遊樂場</button
            >
            <button
              type="button"
              class="danger"
              disabled={!me.key || busy}
              onclick={revokeKey}>撤銷通行證</button
            >
          </div>
        </div>

        <div class="panel">
          <h2>點數</h2>
          <p class="lede">
            剩餘 <strong>{me.credits ?? 0}</strong> 點
            {#if me.turn_hosted}
              · 管理者已開通備援資格
            {:else}
              · 尚未開通備援資格
            {/if}
          </p>
          <div class="prefer-row">
            <label class="prefer">
              <input
                type="checkbox"
                checked={Boolean(me.turn_prefer)}
                disabled={busy || !me.turn_hosted}
                onchange={e => setTurnPrefer(e.currentTarget.checked)}
              />
              <span>使用連線備援</span>
            </label>
            <p class="meta">
              {#if !me.turn_hosted}
                需管理者開通後才可啟用。啟用後跨網邀請會自動使用備援（畫面不顯示直連／轉發）。
              {:else if me.turn_prefer}
                已啟用：點數足夠時會自動使用連線備援。
              {:else}
                已關閉：僅嘗試直連。可隨時再開啟。
              {/if}
            </p>
          </div>
          {#if (me.credits ?? 0) < 10 && me.turn_prefer}
            <p class="meta" role="status">額度偏低時，連線備援可能無法使用。</p>
          {/if}
          <h3 class="subh">Session 扣點</h3>
          {#if creditSessions.length === 0}
            <p class="meta">尚無 session 扣點</p>
          {:else}
            <ul class="credit-list">
              {#each creditSessions as row (row.at + String(row.sessionId || ""))}
                <li>
                  <span class="mono">{row.delta}</span>
                  <span class="meta"
                    >{formatTime(row.at)}
                    {#if row.reason === "turn_credentials"}
                      · 連線備援
                    {:else}
                      · {row.reason}
                    {/if}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}

      {#if tab === "ops" && isAdmin}
        <div role="tabpanel">
          <div class="panel">
            <h2>註冊邀請</h2>
            <p class="lede">發出邀請連結，讓新人完成註冊並進入後台。</p>
            <div class="row">
              <button type="button" disabled={busy} onclick={issueRegInvite}
                >發出註冊邀請</button
              >
            </div>
            {#if regInviteUrl}
              <div class="secret">
                <strong>註冊邀請</strong>
                <code class="mono">{regInviteUrl}</code>
                <div class="row">
                  <button
                    type="button"
                    class="secondary"
                    onclick={async () => {
                      const ok = await copyText(regInviteUrl);
                      flash(ok ? "已複製" : "複製失敗", ok ? "ok" : "warn");
                    }}
                  >
                    複製連結
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <div class="panel">
            <h2>註冊使用者</h2>
            <p class="lede">檢視已註冊帳號；可停用／恢復、加點、開通連線備援。</p>
            <div class="user-list">
              {#each users as u (u.user_id)}
                <div class="user-row">
                  <header>
                    <span class="mono">{u.user_id}</span>
                    <span class="badge"
                      >{u.role === "admin" ? "管理者" : "使用者"}</span
                    >
                    {#if u.disabled}
                      <span class="badge disabled">已停用</span>
                    {:else}
                      <span class="badge">使用中</span>
                    {/if}
                    {#if u.turn_hosted}
                      <span class="badge">連線備援</span>
                    {/if}
                  </header>
                  <p class="meta">
                    {#if u.github}GitHub @{u.github.login}{/if}
                    {#if u.github && u.google}
                      ·
                    {/if}
                    {#if u.google}Google {u.google.email}{/if}
                    {#if !u.github && !u.google}尚未連結登入方式{/if}
                    ·
                    {u.key ? `${u.key.prefix}…` : "尚無通行證"}
                    · 點數 {u.credits ?? 0}
                    ·
                    {formatTime(u.created_at)}
                  </p>
                  <div class="row wrap">
                    {#if u.disabled}
                      <button
                        type="button"
                        class="secondary"
                        disabled={u.user_id === me.user_id || busy}
                        onclick={() => setDisabled(u.user_id, false)}
                        >恢復</button
                      >
                    {:else}
                      <button
                        type="button"
                        class="danger"
                        disabled={u.user_id === me.user_id || busy}
                        onclick={() => setDisabled(u.user_id, true)}
                        >停用</button
                      >
                    {/if}
                    {#if !u.disabled}
                      {#if u.turn_hosted}
                        <button
                          type="button"
                          class="secondary"
                          disabled={busy}
                          onclick={() => adminSetTurnHosted(u.user_id, false)}
                          >關閉連線備援</button
                        >
                      {:else}
                        <button
                          type="button"
                          disabled={busy}
                          onclick={() => adminSetTurnHosted(u.user_id, true)}
                          >開通連線備援</button
                        >
                      {/if}
                      <label class="topup">
                        <span class="sr-only">加點數量</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputmode="numeric"
                          placeholder="點數"
                          value={topupDraft[u.user_id] ?? ""}
                          oninput={e => {
                            topupDraft = {
                              ...topupDraft,
                              [u.user_id]: e.currentTarget.value,
                            };
                          }}
                          disabled={busy}
                        />
                        <button
                          type="button"
                          class="secondary"
                          disabled={busy}
                          onclick={() => adminAddCredits(u.user_id)}
                          >加點</button
                        >
                      </label>
                    {/if}
                  </div>
                </div>
              {:else}
                <p class="meta">尚無註冊使用者。</p>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <footer class="foot">
    API
    <a href="https://api.samkuo.me/health"
      ><span class="mono">api.samkuo.me</span></a
    >
    · 後台 <span class="mono">dash.samkuo.me</span>
    · 場
    <a href="https://play.samkuo.me/"><span class="mono">play.samkuo.me</span></a
    >
  </footer>
</main>

<ConfirmDialog
  open={confirm !== null}
  title={confirm?.title || "確認"}
  message={confirm?.message || ""}
  confirmLabel={confirm?.confirmLabel}
  requireCheck={confirm?.requireCheck}
  checkLabel={confirm?.checkLabel}
  oncancel={() => (confirm = null)}
  onconfirm={runConfirm}
/>
