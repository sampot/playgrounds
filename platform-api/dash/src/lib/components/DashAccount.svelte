<script lang="ts">
  import { dash } from "$lib/dash.svelte";

  const ssoCount = $derived(dash.ssoCount);

  async function unlink(provider: "github" | "google" | "line") {
    const label =
      provider === "github" ? "GitHub" : provider === "google" ? "Google" : "LINE";
    dash.askConfirm({
      title: "解除連結",
      message: `解除後無法再用 ${label} 進入。請至少保留一種登入方式。`,
      action: async () => {
        const res = await fetch(`/v1/me/sso/${provider}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          dash.flash(
            data.error === "last_sso"
              ? "請至少保留一種登入方式"
              : "解除失敗，請稍後再試",
            "err"
          );
          return;
        }
        await dash.refreshMe();
        dash.flash("已解除連結", "ok");
      },
    });
  }

  async function deleteAccount() {
    dash.askConfirm({
      title: "刪除我的帳戶",
      message:
        "刪除後無法再以此帳號進入後台；通行證也會失效。若要回來，需重新取得註冊邀請。",
      requireCheck: true,
      checkLabel: "我了解，確定刪除帳戶",
      confirmLabel: "刪除帳戶",
      action: async () => {
        const res = await fetch("/v1/me", {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          dash.flash(
            data.error === "last_admin"
              ? "請先請其他人接手後台管理，再刪除帳戶"
              : "刪除失敗，請稍後再試",
            "err"
          );
          return;
        }
        dash.setLoggedOut();
        dash.flash("帳戶已刪除", "ok");
      },
    });
  }
</script>

<div class="panel">
  <h2>登入方式</h2>
  <p class="lede">可連結多種登入方式，請至少保留一種。</p>
  <div class="user-list">
    <div class="user-row">
      <header>
        <strong>GitHub</strong>
        {#if dash.me?.github}
          <span class="meta">@{dash.me.github.login}</span>
        {:else}
          <span class="badge">未連結</span>
        {/if}
      </header>
      <div class="row">
        {#if dash.me?.github}
          <button
            type="button"
            class="secondary"
            disabled={ssoCount <= 1 || dash.busy}
            onclick={() => unlink("github")}>解除連結</button
          >
        {:else}
          <a class="btn secondary" href="/auth/github?intent=link">連結 GitHub</a>
        {/if}
      </div>
    </div>
    <div class="user-row">
      <header>
        <strong>Google</strong>
        {#if dash.me?.google}
          <span class="meta">{dash.me.google.email}</span>
        {:else}
          <span class="badge">未連結</span>
        {/if}
      </header>
      <div class="row">
        {#if dash.me?.google}
          <button
            type="button"
            class="secondary"
            disabled={ssoCount <= 1 || dash.busy}
            onclick={() => unlink("google")}>解除連結</button
          >
        {:else}
          <a class="btn secondary" href="/auth/google?intent=link">連結 Google</a>
        {/if}
      </div>
    </div>
    <div class="user-row">
      <header>
        <strong>LINE</strong>
        {#if dash.me?.line}
          <span class="meta">{dash.me.line.display_name}</span>
        {:else}
          <span class="badge">未連結</span>
        {/if}
      </header>
      <div class="row">
        {#if dash.me?.line}
          <button
            type="button"
            class="secondary"
            disabled={ssoCount <= 1 || dash.busy}
            onclick={() => unlink("line")}>解除連結</button
          >
        {:else}
          <a class="btn secondary" href="/auth/line?intent=link">連結 LINE</a>
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
        disabled={dash.busy}
        onclick={deleteAccount}>刪除我的帳戶</button
      >
    </div>
  </div>
</div>
