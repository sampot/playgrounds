<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import "../lib/styles.css";
  import TopNav from "$lib/components/TopNav.svelte";
  import DashboardNav from "$lib/components/DashboardNav.svelte";
  import AccountBar from "$lib/components/AccountBar.svelte";
  import Flash from "$lib/components/Flash.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import { dash } from "$lib/dash.svelte";

  let { children } = $props();

  // The dedicated go login page gets a bare shell (no dash chrome, DEC-054).
  const isBareGoLogin = $derived(page.url.pathname.startsWith("/go/login"));

  onMount(() => {
    void dash.bootstrapSession();
  });
</script>

<svelte:head>
  <title>遊樂場後台 · 我是山姆鍋</title>
  <meta name="description" content="遊樂場後台：帳號與登入遊樂場。" />
</svelte:head>

{#if isBareGoLogin}
  <div class="site">{@render children()}</div>
{:else}
  <div class="site">
    <TopNav current="dash" />
    <main class="main">
      <div class="hero">
        <h1>遊樂場</h1>
        <p>管理帳號，並從這裡登入你的遊樂場。用 GitHub 或 Google 進入即可。</p>
      </div>

      <Flash message={dash.flashMsg} kind={dash.flashKind} />

      <AccountBar />

      {#if dash.me}
        <DashboardNav />
      {/if}

      {@render children()}
    </main>

    <footer class="foot">
      API
      <a href="https://api.samkuo.me/health"><span class="mono">api.samkuo.me</span></a>
      · 後台 <span class="mono">dash.samkuo.me</span>
      · 場
      <a href="https://play.samkuo.me/"><span class="mono">play.samkuo.me</span></a>
    </footer>
  </div>
{/if}

<ConfirmDialog
  open={dash.confirm !== null}
  title={dash.confirm?.title || "確認"}
  message={dash.confirm?.message || ""}
  confirmLabel={dash.confirm?.confirmLabel}
  requireCheck={dash.confirm?.requireCheck}
  checkLabel={dash.confirm?.checkLabel}
  oncancel={() => (dash.confirm = null)}
  onconfirm={() => dash.runConfirm()}
/>
