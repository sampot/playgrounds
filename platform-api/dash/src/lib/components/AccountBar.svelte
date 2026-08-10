<script lang="ts">
  import { dash } from "$lib/dash.svelte";

  async function logout() {
    try {
      await fetch("/v1/auth/logout", {
        method: "POST",
        body: "{}",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    dash.setLoggedOut();
    dash.flash("已登出", "ok");
  }

  async function loginToField() {
    const ret = dash.peekReturnField();
    await dash.provisionAndOpenField(ret || null, { skipConfirm: false });
  }
</script>

<div class="account-bar">
  {#if dash.me}
    <span class="chip">
      <span class="dot" aria-hidden="true"></span>
      <span class="mono">{dash.me.user_id}</span>
      <span aria-hidden="true">·</span>
      <span>{dash.me.role === "admin" ? "管理者" : "使用者"}</span>
      {#if dash.me.github?.login}
        <span class="meta">@{dash.me.github.login}</span>
      {/if}
      {#if dash.me.google?.email}
        <span class="meta">{dash.me.google.email}</span>
      {/if}
    </span>
    <button type="button" class="linkish" onclick={loginToField}
      >登入我的遊樂場</button
    >
    <button type="button" class="linkish" onclick={logout}>登出</button>
  {:else}
    <span class="chip meta">尚未進入</span>
    <a class="btn" href="/auth/github?intent=login">使用 GitHub 進入</a>
    <a class="btn secondary" href="/auth/google?intent=login">使用 Google 進入</a>
  {/if}
</div>
