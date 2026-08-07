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
    type Me,
  } from "$lib/api";

  type Tab = "account" | "keys" | "ops";
  type ConfirmState = {
    title: string;
    message: string;
    confirmLabel?: string;
    requireCheck?: boolean;
    checkLabel?: string;
    action: () => Promise<void>;
  } | null;

  let me = $state<Me | null>(null);
  let tab = $state<Tab>("keys");
  let flashMsg = $state("");
  let flashKind = $state<"ok" | "warn" | "err">("ok");
  let keyReveal = $state("");
  let regInviteUrl = $state("");
  let users = $state<AdminUser[]>([]);
  let confirm = $state<ConfirmState>(null);
  let busy = $state(false);

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

  async function refreshMe() {
    const { res, data } = await api<Me & { error?: string }>("/v1/me");
    if (!res.ok) {
      setAccessToken(null);
      me = null;
      return false;
    }
    me = data;
    return true;
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

  async function bootstrapSession() {
    const params = new URLSearchParams(location.search);
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
      const qs = params.toString();
      history.replaceState({}, "", qs ? `/?${qs}` : "/");
    }
    if (getAccessToken()) {
      const ok = await refreshMe();
      if (ok) {
        const { res, data } = await api<{ api_key?: string }>(
          "/v1/auth/reveal-key",
          { method: "POST", body: "{}" }
        );
        if (res.ok && data.api_key) {
          keyReveal = data.api_key;
          flash("金鑰僅顯示一次，請立刻複製並妥善保存", "warn");
        } else if (linked) {
          flash("已連結登入方式", "ok");
        } else if (claimed) {
          flash("註冊完成", "ok");
        }
        if (me?.role === "admin") await loadUsers();
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
    keyReveal = "";
    flash("已登出", "ok");
  }

  async function rotateKey() {
    askConfirm({
      title: "更換金鑰",
      message: "舊金鑰會立刻失效。若遊樂場仍在使用舊金鑰，請記得改為新的。",
      action: async () => {
        const { res, data } = await api<{ api_key?: string; error?: string }>(
          "/v1/keys",
          { method: "POST" }
        );
        if (!res.ok) {
          flash("更換失敗，請稍後再試", "err");
          return;
        }
        keyReveal = data.api_key || "";
        await refreshMe();
        flash("已更換；請立刻複製新金鑰", "warn");
      },
    });
  }

  async function revokeKey() {
    if (!me?.key) return;
    askConfirm({
      title: "撤銷金鑰",
      message: "撤銷後，遊樂場將無法再使用這把金鑰，直到建立新的。",
      action: async () => {
        const { res } = await api<{ error?: string }>("/v1/keys", {
          method: "DELETE",
        });
        if (!res.ok) {
          flash("撤銷失敗，請稍後再試", "err");
          return;
        }
        keyReveal = "";
        await refreshMe();
        flash("已撤銷金鑰", "ok");
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
        "刪除後無法再以此帳號進入後台；相關金鑰也會失效。若要回來，需重新取得註冊邀請。",
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
        ? "停用後，對方將無法進入後台，遊樂場也無法使用其金鑰。"
        : "恢復後，對方可再次進入後台並使用金鑰。",
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
  <meta name="description" content="遊樂場後台：帳號、金鑰與註冊邀請。" />
</svelte:head>

<main class="main">
  <div class="hero">
    <h1>遊樂場</h1>
    <p>管理帳號與金鑰的地方。用 GitHub 或 Google 進入即可。</p>
  </div>

  <Flash message={flashMsg} kind={flashKind} />

  {#if !me}
    <section>
      <div class="panel">
        <h2>進入</h2>
        <p class="lede">
          所有帳號由此進入。登入後會依權限顯示可用功能。
        </p>
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

      <div class="tabs" role="tablist" aria-label="後台區塊">
        <button
          type="button"
          class="tab"
          role="tab"
          aria-selected={tab === "account"}
          onclick={() => selectTab("account")}>帳號</button
        >
        <button
          type="button"
          class="tab"
          role="tab"
          aria-selected={tab === "keys"}
          onclick={() => selectTab("keys")}>金鑰</button
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

      {#if tab === "keys"}
        <div class="panel" role="tabpanel">
          <h2>金鑰</h2>
          <p class="lede">
            每位帳號一把，給遊樂場使用。完整內容只在建立或更換時顯示一次，請立刻複製並妥善保存。
          </p>
          {#if me.key}
            <p class="mono">{me.key.prefix}…</p>
            <p class="meta">{formatTime(me.key.created_at)}</p>
          {:else}
            <p class="meta">尚無金鑰</p>
          {/if}
          {#if keyReveal}
            <div class="secret">
              <strong>立刻複製 — 不會再顯示</strong>
              <code class="mono">{keyReveal}</code>
              <div class="row">
                <button
                  type="button"
                  class="secondary"
                  onclick={async () => {
                    const ok = await copyText(keyReveal);
                    flash(ok ? "已複製" : "複製失敗，請手動選取", ok ? "ok" : "warn");
                  }}
                >
                  複製金鑰
                </button>
              </div>
            </div>
          {/if}
          <div class="row">
            <button type="button" disabled={busy} onclick={rotateKey}
              >{me.key ? "更換金鑰" : "建立金鑰"}</button
            >
            <button
              type="button"
              class="danger"
              disabled={!me.key || busy}
              onclick={revokeKey}>撤銷</button
            >
          </div>
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
            <p class="lede">檢視已註冊帳號，可停用或恢復。不能停用自己的帳號。</p>
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
                  </header>
                  <p class="meta">
                    {#if u.github}GitHub @{u.github.login}{/if}
                    {#if u.github && u.google}
                      ·
                    {/if}
                    {#if u.google}Google {u.google.email}{/if}
                    {#if !u.github && !u.google}尚未連結登入方式{/if}
                    ·
                    {u.key ? `${u.key.prefix}…` : "尚無金鑰"}
                    ·
                    {formatTime(u.created_at)}
                  </p>
                  <div class="row">
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
