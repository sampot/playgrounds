<script lang="ts">
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import GoSamLoadBar from "$lib/GoSamLoadBar.svelte";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
  import {
    GO_SAM_UNKNOWN_DESCRIPTION,
    GO_SAM_UNKNOWN_DOCUMENT_TITLE,
    goOgMeta,
    goSamCanonicalUrl,
    goSamDescription,
    goSamDocumentTitle,
  } from "$lib/goShareMeta";
  import { isLikelyOffline } from "$lib/goFriendlyError";
  import {
    createSoloRuntime,
    type SoloStatus,
  } from "$lib/soloRuntime";
  import { setGoMemoryCanvasWindow } from "$lib/goMemoryCanvas";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import {
    endGoPlay,
    startGoAnalyticsFlusher,
    startGoPlay,
    tickGoPlay,
    type GoPlayTracker,
  } from "$lib/goAnalytics";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const catalogId = $derived(data.catalogId);
  const entry = $derived(data.entry);
  const og = $derived(
    goOgMeta({
      title: entry
        ? goSamDocumentTitle(entry)
        : GO_SAM_UNKNOWN_DOCUMENT_TITLE,
      description: entry
        ? goSamDescription(entry)
        : GO_SAM_UNKNOWN_DESCRIPTION,
      url: catalogId
        ? goSamCanonicalUrl(catalogId, PLAYGROUNDS_GO_ORIGIN)
        : `${PLAYGROUNDS_GO_ORIGIN}/`,
    })
  );

  let status = $state<SoloStatus | null>(null);
  const runtime = createSoloRuntime();

  // —— play analytics (PG-ANALYTICS-PLAN) ——
  let playTracker = $state<GoPlayTracker | null>(null);
  let playedCatalog: string | null = null;
  const documentVisible = $derived(
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  // Subscribe immediately so fast boots are not missed before onMount.
  const stopRuntime = runtime.subscribe(s => {
    status = s;
    if (s.entry) chromeSession.setSolo(s.entry);
    else if (s.phase === "error") chromeSession.clear();
  });

  const showCanvas = $derived(
    status?.phase === "ready" &&
      (Boolean(status.canvasUrl) || Boolean(status.canvasSrcdoc))
  );

  // (Re)start a play when a new catalog booted a canvas (play_start).
  $effect(() => {
    const id = catalogId;
    const listed = Boolean(entry);
    if (!showCanvas || !id) return;
    if (playedCatalog === id && playTracker) return;
    // Swap to another catalog mid-play — close the previous one first.
    const prior = playedCatalog && playedCatalog !== id ? playedCatalog : null;
    const priorTracker = prior ? playTracker : null;
    playedCatalog = id;
    if (prior && priorTracker) {
      playTracker = null;
      void endGoPlay(prior, priorTracker);
    }
    void startGoPlay(id, listed).then(t => {
      if (t) playTracker = t;
    });
  });

  // Accrue visible time while the page stays visible.
  $effect(() => {
    if (!playTracker || !documentVisible) return;
    const onVis = () => {
      if (document.visibilityState === "visible") tickGoPlay(playTracker!);
    };
    document.addEventListener("visibilitychange", onVis);
    tickGoPlay(playTracker);
    return () => document.removeEventListener("visibilitychange", onVis);
  });

  // Close the current play on hide/unload (visible time only), best-effort flush.
  $effect(() => {
    if (!playTracker || documentVisible) return;
    const tracker = playTracker;
    const id = playedCatalog;
    playTracker = null;
    playedCatalog = null;
    if (id) void endGoPlay(id, tracker);
  });

  function onMemoryFrameLoad(ev: Event) {
    const el = ev.currentTarget as HTMLIFrameElement;
    setGoMemoryCanvasWindow(el.contentWindow);
  }

  onMount(() => {
    if (entry) chromeSession.setSolo(entry);
    const stopFlush = startGoAnalyticsFlusher();
    return () => {
      stopFlush();
      if (playedCatalog && playTracker) {
        const id = playedCatalog;
        const tracker = playTracker;
        playTracker = null;
        playedCatalog = null;
        void endGoPlay(id, tracker);
      }
      stopRuntime();
      runtime.dispose();
      chromeSession.clear();
    };
  });

  $effect(() => {
    chromeSession.setCanvasActive(showCanvas);
    return () => chromeSession.setCanvasActive(false);
  });

  $effect(() => {
    const id = catalogId;
    if (!id) return;
    void runtime.bootFromCatalogId(id);
  });

  const showOfflineHint = $derived(
    status?.phase === "error" &&
      (isLikelyOffline() ||
        Boolean(status.error?.includes("沒有網路") || status.error?.includes("還沒存")))
  );

  function retryLoad() {
    const id = catalogId;
    if (!id) return;
    void runtime.bootFromCatalogId(id);
  }
</script>

<svelte:head>
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <link rel="canonical" href={og.url} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content={og.siteName} />
  <meta property="og:title" content={og.title} />
  <meta property="og:description" content={og.description} />
  <meta property="og:url" content={og.url} />
  <meta property="og:image" content={og.image} />
  <meta property="og:image:width" content={String(og.imageWidth)} />
  <meta property="og:image:height" content={String(og.imageHeight)} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
</svelte:head>

{#if !catalogId}
  <h1>無法開啟</h1>
  <p class="err" role="alert">連結不完整</p>
{:else if !entry && (!status || status.phase === "idle" || status.phase === "loading")}
  <h1>無法開啟</h1>
  <p class="err" role="alert">型錄沒有這項小品（可能已下架）</p>
  <p class="lead">
    可回
    <a href={`${PLAY_ORIGIN}/sam/`} target="_blank" rel="noopener noreferrer"
      >型錄</a
    >
    挑選其他小品。
  </p>
{:else if !status || status.phase === "idle" || status.phase === "loading"}
  <h1>{entry?.title || status?.entry?.title || "開啟小品"}</h1>
  <p class="status" role="status">{status?.message || "正在載入…"}</p>
  <GoSamLoadBar
    progress={status?.loadProgress ?? { ratio: null, detail: "準備中…" }}
    label="小品下載進度"
  />
{:else if status.phase === "error"}
  <h1>打不開</h1>
  <p class="err" role="alert">{status.error}</p>
  <p class="actions">
    <button type="button" class="btn primary" onclick={retryLoad}>再試一次</button>
  </p>
  {#if showOfflineHint}
    <p class="lead">連上網路後再試；成功開過一次的小品，之後就能離線玩。</p>
  {:else}
    <p class="lead">
      可回
      <a href={`${PLAY_ORIGIN}/sam/`} target="_blank" rel="noopener noreferrer"
        >型錄</a
      >
      或
      <a
        href={`${PLAY_ORIGIN}/`}
        target="_blank"
        rel="noopener noreferrer"
        onclick={openPlaygroundHome}>山姆鍋遊樂場</a
      >
      挑選其他小品。
    </p>
  {/if}
{:else}
  <h1 class="sr-only">{status.entry?.title || entry?.title || "小品"}</h1>
  {#if showCanvas}
    <div class="stage stage--fill">
      {#if status.canvasMode === "memory" && status.canvasSrcdoc}
        {#key status.canvasGeneration}
          <iframe
            class="play"
            title={status.entry?.title || "小品畫布"}
            srcdoc={status.canvasSrcdoc}
            allow="autoplay"
            onload={onMemoryFrameLoad}
          ></iframe>
        {/key}
      {:else if status.canvasUrl}
        {#key status.canvasUrl}
          <iframe
            class="play"
            title={status.entry?.title || "小品畫布"}
            src={status.canvasUrl}
            allow="autoplay"
          ></iframe>
        {/key}
      {/if}
    </div>
  {/if}
{/if}

<style>
  .lead {
    margin-top: 1rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin-top: 1rem;
  }
  .btn {
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: var(--radius);
    border: 1px solid rgb(var(--line));
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  .btn.primary {
    background: rgb(var(--accent));
    border-color: rgb(var(--accent));
    color: #fff;
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
</style>
