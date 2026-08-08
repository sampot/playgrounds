<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { findGoCatalogBySource } from "$lib/goCatalog";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
  import {
    createGuestRuntime,
    type GuestStatus,
  } from "$lib/guestRuntime";
  import {
    composeSamSource,
    composeSessionProtocol,
  } from "@pg/platform/platformCompose";
  import {
    likelyInAppBrowser,
  } from "$lib/goCanvasSupport";
  import { setGoMemoryCanvasWindow } from "$lib/goMemoryCanvas";

  const shortId = $derived(page.params.shortId?.trim() || "");
  let status = $state<GuestStatus | null>(null);
  let nameInput = $state("對手");
  let busy = $state(false);
  let copyFlash = $state("");
  const runtime = createGuestRuntime();
  const inAppHint = $derived(likelyInAppBrowser());

  const protocolLabel = $derived.by(() => {
    const meta = status?.meta;
    if (!meta) return null;
    const p = composeSessionProtocol(meta.intent);
    if (p && typeof p === "object" && "protocolId" in p) {
      return String((p as { protocolId: string }).protocolId);
    }
    return meta.kind;
  });

  const samSource = $derived(
    status?.meta ? composeSamSource(status.meta.intent) : null
  );

  $effect(() => {
    const source = samSource;
    if (!status || status.phase === "idle") {
      chromeSession.clear();
      return;
    }
    const entry = source ? findGoCatalogBySource(source) : null;
    chromeSession.setInvite(entry ?? null);
  });

  const showCanvas = $derived(
    status?.phase === "ready" &&
      (Boolean(status.canvasUrl) || Boolean(status.canvasSrcdoc))
  );

  function onMemoryFrameLoad(ev: Event) {
    const el = ev.currentTarget as HTMLIFrameElement;
    setGoMemoryCanvasWindow(el.contentWindow);
  }

  $effect(() => {
    chromeSession.setCanvasActive(showCanvas);
    return () => chromeSession.setCanvasActive(false);
  });

  onMount(() => {
    const unsub = runtime.subscribe(s => {
      status = s;
      if (s.displayName) nameInput = s.displayName;
    });
    if (shortId) void runtime.bootFromShortId(shortId);
    return () => {
      unsub();
      chromeSession.clear();
    };
  });

  async function onAccept() {
    busy = true;
    try {
      await runtime.consentAndPlay(nameInput);
    } finally {
      busy = false;
    }
  }

  function onDecline() {
    runtime.decline();
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      copyFlash = "已複製連結";
      window.setTimeout(() => {
        copyFlash = "";
      }, 2000);
    } catch {
      copyFlash = "複製失敗，請手動選取網址列";
    }
  }
</script>

<svelte:head>
  <title>加入 · 山姆鍋遊樂場</title>
</svelte:head>

{#if !shortId}
  <h1>無法開始</h1>
  <p class="err" role="alert">邀請連結不完整</p>
{:else if !status || status.phase === "resolving" || status.phase === "idle"}
  <h1>加入</h1>
  <p class="status" role="status">{status?.message || "正在讀取邀請…"}</p>
{:else if status.phase === "error"}
  <h1>無法開始</h1>
  <p class="err" role="alert">{status.error}</p>
  <div class="actions" style="margin-top: 1rem">
    <button type="button" class="btn primary" onclick={() => void copyInviteLink()}>
      複製邀請連結
    </button>
  </div>
  {#if copyFlash}
    <p class="status" role="status">{copyFlash}</p>
  {/if}
  <p class="status" style="margin-top: 1rem">
    若在 LINE 等 App 內開啟失敗，請用系統瀏覽器開啟連結（iPhone：⋯ → 在 Safari 開啟）。也可請主持重新邀請，或開啟
    <a
      href={`${PLAY_ORIGIN}/`}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundHome}>遊樂場主頁</a
    >
  </p>
{:else if status.phase === "consent"}
  <h1>加入對弈</h1>
  {#if inAppHint}
    <p class="hint" role="note">
      偵測到 App 內建瀏覽器。若加入後無法顯示棋盤，請改用 Safari／Chrome 開啟本連結。
    </p>
  {/if}
  <p class="lead">
    {#if protocolLabel}
      協定 <span class="mono">{protocolLabel}</span>
    {/if}
    {#if samSource}
      · 來源 <span class="mono">{samSource}</span>
    {/if}
  </p>
  <label class="field">
    <span>顯示名稱</span>
    <input
      class="input"
      type="text"
      maxlength="32"
      bind:value={nameInput}
      disabled={busy}
      autocomplete="nickname"
    />
  </label>
  <div class="actions">
    <button
      type="button"
      class="btn primary"
      disabled={busy}
      onclick={() => void onAccept()}
    >
      {busy ? "處理中…" : "同意加入"}
    </button>
    <button type="button" class="btn" disabled={busy} onclick={onDecline}>
      取消
    </button>
  </div>
{:else if showCanvas}
  <h1 class="sr-only">對弈</h1>
  <div class="stage stage--fill">
    {#if status.canvasMode === "memory" && status.canvasSrcdoc}
      {#key status.canvasGeneration}
        <iframe
          class="play"
          title="小品畫布"
          srcdoc={status.canvasSrcdoc}
          allow="autoplay"
          onload={onMemoryFrameLoad}
        ></iframe>
      {/key}
    {:else if status.canvasUrl}
      {#key status.canvasUrl}
        <iframe
          class="play"
          title="小品畫布"
          src={status.canvasUrl}
          allow="autoplay"
        ></iframe>
      {/key}
    {/if}
  </div>
{:else}
  <h1 class="sr-only">對弈</h1>
  <p class="status bar" role="status">
    {status.message || "進行中…"}
  </p>
  {#if status.error}
    <p class="err" role="alert">{status.error}</p>
  {/if}
  <div class="wait" role="status" aria-live="polite">
    <p class="wait-title">
      {#if status.phase === "loading_sam"}
        正在載入小品
      {:else if status.phase === "connecting"}
        正在與主持握手
      {:else if status.phase === "waiting_invite"}
        已連線，等待入座
      {:else if status.phase === "seating"}
        正在進入對玩
      {:else}
        請稍候
      {/if}
    </p>
    <p class="wait-hint">對弈畫面會在入座完成後出現，請勿關閉此頁。</p>
  </div>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.75rem 0 1rem;
    font-size: 0.85rem;
  }
  .input {
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    font: inherit;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .btn {
    min-height: 2.75rem;
    padding: 0.5rem 1rem;
    border-radius: var(--radius);
    border: 1px solid rgb(var(--line));
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .btn.primary {
    border-color: transparent;
    background: rgb(var(--accent));
    color: #fff;
  }
  :global(html[data-theme="dark"]) .btn.primary {
    color: #042f2e;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .bar {
    margin: 0 0 0.5rem;
  }
  .wait {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
    min-height: min(50vh, 20rem);
    padding: 1.25rem 1rem;
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    background: rgb(var(--card));
    text-align: center;
  }
  .wait-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
  }
  .wait-hint {
    margin: 0;
    color: rgb(var(--muted));
    font-size: 0.9rem;
  }
  .hint {
    margin: 0 0 0.75rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius);
    border: 1px solid rgb(var(--line));
    background: rgb(var(--fill));
    color: rgb(var(--muted));
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .stage {
    flex: 1;
    min-height: min(70vh, 36rem);
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    overflow: hidden;
    background: #0a1210;
  }
  .stage--fill {
    min-height: 0;
    height: 100%;
    border: none;
    border-radius: 0;
  }
  .play {
    display: block;
    width: 100%;
    height: min(70vh, 36rem);
    border: 0;
    background: #fff;
  }
  .stage--fill .play {
    height: 100%;
    min-height: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
  @media (min-width: 40rem) {
    .actions {
      flex-direction: row;
    }
    .btn {
      flex: 1;
    }
  }
</style>
