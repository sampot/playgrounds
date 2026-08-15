<script lang="ts">
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import GoSamLoadBar from "$lib/GoSamLoadBar.svelte";
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
  import GoHostBar from "$lib/GoHostBar.svelte";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import {
    subscribeGoShellPlatformEvents,
    type GoShellPlatformLoginNeededEvent,
  } from "$lib/goShellPlatform";
  import {
    createHostInviteBind,
    type HostInviteController,
    type HostInviteShare,
  } from "$lib/hostInviteBind.svelte";
import { goAuth } from "$lib/goAuth.svelte";
import { hostableProtocolFor } from "$lib/goCatalog";
import type { HostRuntime } from "$lib/hostRuntime";
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
  // Mutable slot for the host-runtime getter (DEC-053 env.HOST). `hostInvite`
  // is created in a `$effect` and binds a `HostRuntime` later than the canvas
  // mounts, so we hand `soloRuntime` a getter that reads the latest binding.
  let hostRuntimeRef: HostRuntime | null = null;
  const runtime = createSoloRuntime({
    getHostRuntime: () => hostRuntimeRef,
  });

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
    // 邀請對弈開場後保留頁內操作（Host bar ／分享面），不進入全屏畫布模式。
    chromeSession.setCanvasActive(showCanvas && !hostLiving);
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

  // —— GO-INVITE：玩家主場（框架，protocol 由 catalog 決定）——

  const hostProtocol = $derived(hostableProtocolFor(entry));
  const hostable = $derived(Boolean(hostProtocol));

  let hostInvite: HostInviteController | null = $state(null);
  let hostBusy = $state(false);
  let hostShareOpen = $state(false);
  let hostShare: HostInviteShare | null = $state(null);
  /** Host runtime phase mirror (reactive). */
  let hostPhase = $state<"idle" | "open" | "waiting" | "ready" | "active" | "ended" | "error">("idle");

  const hostLiving = $derived(hostPhase !== "idle" && hostPhase !== "error");

  $effect(() => {
    const c = hostInvite;
    if (!c) {
      hostPhase = "idle";
      return;
    }
    return c.subscribe(s => {
      hostPhase = s.phase;
    });
  });

  $effect(() => {
    const id = catalogId;
    if (!id || !hostable) {
      hostInvite?.unbind();
      hostInvite = null;
      hostRuntimeRef = null;
      return;
    }
    const bind = createHostInviteBind({
      catalogId: id,
      entry: entry!,
      getFiles: () => runtime.getFiles(),
      getSandboxId: () => runtime.getSandboxId(),
    });
    bind.bind();
    hostInvite = bind;
    // DEC-053: hand `soloRuntime` the live HostRuntime so mounted canvases can
    // resolve `env.HOST` (functions.js sees the same singleton the host bar
    // uses — no split state).
    hostRuntimeRef = bind.getHostRuntime();
    return () => {
      bind.unbind();
      if (hostInvite === bind) hostInvite = null;
      hostRuntimeRef = null;
    };
  });

  function openHostShare(share: HostInviteShare) {
    hostShare = share;
    hostShareOpen = true;
    let spoken = share.shortUrl;
    try {
      const u = new URL(share.shortUrl);
      spoken = `${u.host}${u.pathname}`;
    } catch {
      /* keep raw */
    }
    chromeSession.setFlash(`已產生邀請：${spoken}`);
  }

  function routeLoginNeeded(_ev: GoShellPlatformLoginNeededEvent) {
    hostBusy = false;
    chromeSession.setFlash("要邀請對弈需先登入遊樂場通行證");
    goAuth.login();
  }

  $effect(() => {
    return subscribeGoShellPlatformEvents(ev => {
      if (ev.kind === "invite.compose") {
        const b = hostInvite;
        if (!b) return;
        void b.adoptSamInvite(ev).then(share => {
          if (share) openHostShare(share);
        });
      } else {
        routeLoginNeeded(ev);
      }
    });
  });

  async function inviteOpponent() {
    const b = hostInvite;
    if (!b) return;
    hostBusy = true;
    try {
      const share = await b.mintShare();
      if (share) openHostShare(share);
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e
          ? String((e as { code: unknown }).code)
          : "";
      if (code === "not_provisioned") {
        routeLoginNeeded({
          kind: "login_needed",
          message: e instanceof Error ? e.message : "請先登入",
        });
      } else {
        chromeSession.setFlash(
          e instanceof Error ? e.message : "邀請失敗，請稍後再試"
        );
      }
    } finally {
      hostBusy = false;
    }
  }

  function closeHostShareSheet() {
    hostShareOpen = false;
  }

  /** 開始一局：generic opaque host act（framework 不解讀 payload）。 */
  function hostStart() {
    void hostInvite?.act({ type: "start", firstRole: "host" });
  }
  function hostRestart() {
    void hostInvite?.act({ type: "reset", firstRole: "host" });
  }
  function hostClose() {
    void hostInvite?.close();
    chromeSession.setFlash("已結束這一場");
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
  <h1 class="pixel-text">無法開啟</h1>
  <div class="pixel-status" role="alert">
    <p class="pixel-status-body err">連結不完整</p>
  </div>
{:else if !entry && (!status || status.phase === "idle" || status.phase === "loading")}
  <h1 class="pixel-text">無法開啟</h1>
  <div class="pixel-status" role="alert">
    <p class="pixel-status-title">型錄沒有這項小品</p>
    <p class="pixel-status-body">可能已下架。可回
      <a href={`${PLAYGROUNDS_GO_ORIGIN}/sam/`} target="_blank" rel="noopener noreferrer"
        >型錄</a
      >
      挑選其他小品。
    </p>
  </div>
{:else if !status || status.phase === "idle" || status.phase === "loading"}
  <h1 class="pixel-text">{entry?.title || status?.entry?.title || "開啟小品"}</h1>
  <div class="pixel-status" role="status">
    <p class="pixel-status-title">{status?.message || "正在載入…"}</p>
    <GoSamLoadBar
      progress={status?.loadProgress ?? { ratio: null, detail: "準備中…" }}
      label="小品下載進度"
    />
  </div>
{:else if status.phase === "error"}
  <h1 class="pixel-text">打不開</h1>
  <div class="pixel-status" role="alert">
    <p class="pixel-status-title err">{status.error}</p>
    <p class="actions">
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={retryLoad}>再試一次</button>
    </p>
    {#if showOfflineHint}
      <p class="pixel-status-body">連上網路後再試；成功開過一次的小品，之後就能離線玩。</p>
    {:else}
      <p class="pixel-status-body">
        可回 <a href={`${PLAYGROUNDS_GO_ORIGIN}/`}>山姆鍋遊樂場</a> 挑選其他小品。
      </p>
    {/if}
  </div>
{:else}
  <h1 class="sr-only">{status.entry?.title || entry?.title || "小品"}</h1>
  {#if hostable}
    <GoHostBar
      loggedIn={goAuth.loggedIn}
      controller={hostInvite}
      busy={hostBusy}
      onInvite={inviteOpponent}
      onLoginNeeded={() => goAuth.login()}
      onStart={hostStart}
      onReset={hostRestart}
      onClose={hostClose}
    />
  {/if}
  {#if showCanvas}
    <div
      class={["stage", hostLiving ? "" : "stage--fill"]
        .filter(Boolean)
        .join(" ")}
    >
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
  {#if hostInvite && hostShare}
    <GoShareSheet
      open={hostShareOpen}
      title={hostShare.title}
      url={hostShare.url}
      spoken={hostShare.url}
      onClose={closeHostShareSheet}
      onFlash={msg => chromeSession.setFlash(msg)}
    />
  {/if}
{/if}

<style>
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    margin: 0.75rem 0 0;
  }
  .stage {
    flex: 1;
    min-height: min(70vh, 36rem);
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    overflow: hidden;
    background: #0a1210;
    box-shadow: var(--pixel-shadow);
  }
  .stage--fill {
    min-height: 0;
    height: 100%;
    border: none;
    border-radius: 0;
    box-shadow: none;
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
