<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
  import {
    createSoloRuntime,
    type SoloStatus,
  } from "$lib/soloRuntime";
  import { setGoMemoryCanvasWindow } from "$lib/goMemoryCanvas";

  const catalogId = $derived(page.params.catalogId?.trim() || "");
  let status = $state<SoloStatus | null>(null);
  const runtime = createSoloRuntime();

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

  function onMemoryFrameLoad(ev: Event) {
    const el = ev.currentTarget as HTMLIFrameElement;
    setGoMemoryCanvasWindow(el.contentWindow);
  }

  onMount(() => {
    return () => {
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
</script>

<svelte:head>
  <title
    >{status?.entry?.title
      ? `${status.entry.title} · 遊樂場`
      : "小品 · 遊樂場"}</title
  >
</svelte:head>

{#if !catalogId}
  <h1>無法開啟</h1>
  <p class="err" role="alert">連結不完整</p>
{:else if !status || status.phase === "idle" || status.phase === "loading"}
  <h1>{status?.entry?.title || "開啟小品"}</h1>
  <p class="status" role="status">{status?.message || "正在載入…"}</p>
{:else if status.phase === "error"}
  <h1>無法開啟</h1>
  <p class="err" role="alert">{status.error}</p>
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
      onclick={openPlaygroundHome}>遊樂場</a
    >
    挑選其他小品。
  </p>
{:else}
  <h1 class="sr-only">{status.entry?.title || "小品"}</h1>
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
