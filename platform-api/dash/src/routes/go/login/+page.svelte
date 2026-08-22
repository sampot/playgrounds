<script lang="ts">
  import { dash } from "$lib/dash.svelte";

  // After SSO, return to this go login page (not dash root) so the stashed
  // `?field=` auto-provisions straight back to go — no dash homepage flash.
  // Thread `?return_to=` (the go page the user came from) through SSO as well,
  // so provision lands back on the same game, not the go root.
  const returnPath =
    typeof window === "undefined"
      ? "/go/login"
      : `${window.location.pathname}${window.location.search}`;
  const lineHref = `/auth/line?intent=login&return=${encodeURIComponent(returnPath)}`;
  const googleHref = `/auth/google?intent=login&return=${encodeURIComponent(returnPath)}`;
</script>

<svelte:head>
  <title>登入遊樂場 · 我是山姆鍋</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="go-login-panel">
  <div class="hero">
    <h1>登入遊樂場</h1>
    {#if dash.redirectingToField}
      <p>登入成功，即將返回純玩版。</p>
    {:else}
      <p>登入成功後自動回到純玩版，繼續遊玩。</p>
    {/if}
  </div>
  {#if dash.redirectingToField}
    <div class="panel" role="status" aria-live="polite">
      <h2>即將返回</h2>
      <p class="lede">正在回到你的遊樂場…</p>
    </div>
  {:else}
    <div class="panel">
      <h2>選擇一種方式登入</h2>
      <p class="lede">
        純玩版以 LINE 登入為主要方式，也可使用 Google。第一次以此身分進入會自動建立遊樂場帳戶。
      </p>
      <div class="row go-login-actions">
        <a class="btn" href={lineHref}>使用 LINE 進入</a>
        <a class="btn secondary" href={googleHref}>使用 Google 進入</a>
      </div>
    </div>
  {/if}
</div>

<style>
  .go-login-panel {
    max-width: 26rem;
    margin: auto;
    padding: 1rem;
  }
  .go-login-actions {
    flex-direction: column;
  }
  .go-login-actions .btn {
    width: 100%;
    justify-content: center;
    min-height: 2.75rem;
  }
</style>