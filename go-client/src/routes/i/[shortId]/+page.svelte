<script lang="ts">
  import { page } from "$app/state";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { findGoCatalogBySource } from "$lib/goCatalog";
  import GoSamLoadBar from "$lib/GoSamLoadBar.svelte";
  import {
    createGuestRuntime,
    type GuestStatus,
  } from "$lib/guestRuntime";
  import {
    GO_INVITE_DESCRIPTION,
    GO_INVITE_DOCUMENT_TITLE,
    goInviteCanonicalUrl,
    goOgMeta,
  } from "$lib/goShareMeta";
  import {
    composeSamSource,
    isRoomInvite,
  } from "@pg/platform/platformCompose";
  import { guestInviteShowsRoomSurface } from "$lib/goGuestInviteUi";
  import GoRoomSurface from "$lib/GoRoomSurface.svelte";
  import GoRoomDevProbe from "$lib/GoRoomDevProbe.svelte";
  import {
    GO_ROOM_CONNECTING_TITLE,
    GO_ROOM_DOOR_ENTER,
    GO_ROOM_DOOR_LEAD,
    GO_ROOM_DOOR_NAME,
    GO_ROOM_DOOR_TITLE,
    GO_ROOM_GUEST_NAME_FALLBACK,
  } from "$lib/goRoom";
  import {
    likelyInAppBrowser,
  } from "$lib/goCanvasSupport";
  import { setGoMemoryCanvasWindow } from "$lib/goMemoryCanvas";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import {
    attachGoRoomDev,
    goRoomDevJoinName,
    goRoomDevPageEnabled,
    goRoomDevPeerCount,
    parseGoRoomDevQuery,
    type GoRoomDevHandle,
  } from "$lib/goRoomDev";

  const shortId = $derived(page.params.shortId?.trim() || "");
  const og = $derived(
    goOgMeta({
      title: GO_INVITE_DOCUMENT_TITLE,
      description: GO_INVITE_DESCRIPTION,
      url: goInviteCanonicalUrl(shortId, PLAYGROUNDS_GO_ORIGIN),
    })
  );
  let status = $state<GuestStatus | null>(null);
  let nameInput = $state("對手");
  let busy = $state(false);
  let copyFlash = $state("");
  const runtime = createGuestRuntime();
  const inAppHint = $derived(likelyInAppBrowser());
  const devEnabled = $derived(browser && goRoomDevPageEnabled());
  const devQuery = $derived(
    browser
      ? parseGoRoomDevQuery(page.url.searchParams)
      : { mint: false, join: false, login: false, name: null }
  );
  const peerCount = $derived(goRoomDevPeerCount(status?.guestCount ?? 0));
  const guestDoorUrl = $derived(
    browser && shortId
      ? `${location.origin}/i/${encodeURIComponent(shortId)}`
      : null
  );

  let devHandle: GoRoomDevHandle | null = null;
  let autoJoined = false;

  const samSource = $derived(
    status?.meta ? composeSamSource(status.meta.intent) : null
  );

  const inviteEntry = $derived(
    samSource ? findGoCatalogBySource(samSource) ?? null : null
  );

  const isRoom = $derived(
    Boolean(status?.meta && isRoomInvite(status.meta.kind, status.meta.intent)) ||
      status?.surface === "room"
  );

  $effect(() => {
    // 包廂主面自己管 overlay chrome；不要當遊戲邀請設 catalog，
    // 也不要 clear() 把 canvasActive／holdAutoHide 清掉。
    if (isRoom) return;
    const source = samSource;
    if (
      !status ||
      status.phase === "idle" ||
      status.phase === "cancelled" ||
      status.phase === "ended" ||
      status.phase === "left"
    ) {
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

  const showRoomSurface = $derived(
    guestInviteShowsRoomSurface({
      isRoom,
      phase: status?.phase ?? "",
    })
  );

  function onMemoryFrameLoad(ev: Event) {
    const el = ev.currentTarget as HTMLIFrameElement;
    setGoMemoryCanvasWindow(el.contentWindow);
  }

  $effect(() => {
    if (isRoom || !status) return;
    chromeSession.setCanvasActive(showCanvas);
  });

  onMount(() => {
    const unsub = runtime.subscribe((s) => {
      status = s;
      if (s.displayName) nameInput = s.displayName;
      devHandle?.sync();
    });
    if (shortId) void runtime.bootFromShortId(shortId);

    if (devEnabled) {
      devHandle = attachGoRoomDev({
        enabled: true,
        role: "guest",
        getSnapshot: () => {
          const s = runtime.getStatus();
          return {
            phase: s.phase,
            doorUrl:
              typeof location !== "undefined" && shortId
                ? `${location.origin}/i/${encodeURIComponent(shortId)}`
                : null,
            guestCount: s.guestCount,
            loggedIn: false,
            inviteDoor: "none",
          };
        },
        mint: async () => {
          throw new Error("guest cannot mint");
        },
        join: async (displayName?: string) => {
          const name =
            displayName?.trim() ||
            goRoomDevJoinName(parseGoRoomDevQuery(page.url.searchParams));
          nameInput = name;
          await runtime.consentAndPlay(name);
        },
      });
    }

    return () => {
      unsub();
      devHandle?.dispose();
      devHandle = null;
      chromeSession.clear();
    };
  });

  $effect(() => {
    if (!browser || !devEnabled || !devQuery.join) return;
    if (!isRoom) return;
    if (!status || status.phase !== "consent") return;
    if (autoJoined || busy) return;
    autoJoined = true;
    const name = goRoomDevJoinName(devQuery);
    nameInput = name;
    void (async () => {
      busy = true;
      try {
        await runtime.consentAndPlay(name);
        devHandle?.sync();
      } catch {
        /* status.error already set */
      } finally {
        busy = false;
      }
    })();
  });

  async function onAccept() {
    busy = true;
    try {
      await runtime.consentAndPlay(nameInput);
      devHandle?.sync();
    } finally {
      busy = false;
    }
  }

  function onDecline() {
    runtime.decline();
  }

  function onReopenInvite() {
    if (!shortId) return;
    void runtime.bootFromShortId(shortId);
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
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <meta name="robots" content="noindex, nofollow" />
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
  <meta property="og:image:alt" content={og.imageAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content={og.twitterSite} />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
  <meta name="twitter:image:alt" content={og.imageAlt} />
</svelte:head>

{#if devEnabled}
  <GoRoomDevProbe
    phase={status?.phase ?? "idle"}
    {peerCount}
    doorUrl={guestDoorUrl}
  />
{/if}

{#if !shortId}
  <h1 class="pixel-text">無法開始</h1>
  <div class="pixel-status" role="alert">
    <p class="pixel-status-body err">邀請連結不完整</p>
  </div>
{:else if !status || status.phase === "resolving" || status.phase === "idle"}
  <h1 class="pixel-text">邀請</h1>
  <div class="pixel-status" role="status">
    <p class="pixel-status-title">{status?.message || "正在讀取邀請…"}</p>
  </div>
{:else if status.phase === "cancelled"}
  <h1 class="pixel-text">已取消</h1>
  <div class="pixel-status" role="status">
    <p class="pixel-status-title">已取消這次邀請</p>
    <p class="pixel-status-body">若要重新加入，可再開此連結，或回遊樂場大廳挑別的小品。</p>
    <div class="actions">
      <a class="pixel-btn pixel-btn--primary" href="/">回遊樂場大廳</a>
      <button type="button" class="pixel-btn" onclick={onReopenInvite}>
        重新開啟此邀請
      </button>
    </div>
  </div>
{:else if status.phase === "left"}
  <h1 class="pixel-text">已離開這一間</h1>
  <div class="pixel-status" role="status">
    <p class="pixel-status-title">已離開這一間</p>
    <p class="pixel-status-body">其他人還在。若要再進，請對方再發一次邀請。</p>
    <div class="actions">
      <a class="pixel-btn pixel-btn--primary" href="/">回遊樂場大廳</a>
    </div>
  </div>
{:else if status.phase === "ended"}
  <h1 class="pixel-text">{isRoom ? "這一間已結束" : "這一場已結束"}</h1>
  <div class="pixel-status" role="status">
    <p class="pixel-status-title">{status.error || (isRoom ? "主持已關掉這一間" : "主持已結束這一場")}</p>
    <p class="pixel-status-body">{isRoom ? "請對方再發一次邀請，或回遊樂場大廳。" : "可請主持重新邀請，或回遊樂場大廳挑別的小品。"}</p>
    <div class="actions">
      <a class="pixel-btn pixel-btn--primary" href="/">回遊樂場大廳</a>
      {#if !isRoom}
        <button type="button" class="pixel-btn" onclick={onReopenInvite}>
          重新開啟此邀請
        </button>
      {/if}
    </div>
  </div>
{:else if status.phase === "error"}
  <h1 class="pixel-text">無法開始</h1>
  <div class="pixel-status" role="alert">
    <p class="pixel-status-title err">{status.error}</p>
    <div class="actions">
      <button type="button" class="pixel-btn pixel-btn--primary" onclick={() => void copyInviteLink()}>
        複製邀請連結
      </button>
    </div>
    {#if copyFlash}
      <p class="pixel-status-body" role="status">{copyFlash}</p>
    {/if}
    <p class="pixel-status-body">
      若在 LINE 等 App 內開啟失敗，請用系統瀏覽器開啟連結（iPhone：⋯ → 在 Safari 開啟）。也可請主持重新邀請，或開啟
      <a
        href={`${PLAYGROUNDS_GO_ORIGIN}/`}
        target="_blank"
        rel="noopener noreferrer"
        >山姆鍋遊樂場主頁</a
      >
    </p>
  </div>
{:else if status.phase === "consent"}
  {#if isRoom}
    <section class="door" aria-labelledby="door-title">
      <div class="door-screen" aria-hidden="true">
        <span class="door-snow"></span>
        <span class="door-scan"></span>
      </div>
      <div class="door-card pixel-frame">
        {#if inAppHint}
          <p class="hint" role="note">
            偵測到 App 內建瀏覽器。若加入後畫面不完整，請改用 Safari／Chrome 開啟本連結。
          </p>
        {/if}
        <h1 id="door-title" class="pixel-text door-title">{GO_ROOM_DOOR_TITLE}</h1>
        <p class="door-lead">{GO_ROOM_DOOR_LEAD}</p>
        <label class="field">
          <span>{GO_ROOM_DOOR_NAME}</span>
          <input
            class="pixel-input"
            type="text"
            maxlength="32"
            bind:value={nameInput}
            disabled={busy}
            autocomplete="nickname"
            placeholder={GO_ROOM_GUEST_NAME_FALLBACK}
          />
        </label>
        <div class="actions">
          <button
            type="button"
            class="pixel-btn pixel-btn--primary"
            disabled={busy}
            onclick={() => void onAccept()}
          >
            {busy ? GO_ROOM_CONNECTING_TITLE : GO_ROOM_DOOR_ENTER}
          </button>
          <button type="button" class="pixel-btn" disabled={busy} onclick={onDecline}>
            取消
          </button>
        </div>
      </div>
    </section>
  {:else}
  <h1 class="pixel-text">接受邀請</h1>
  <div class="pixel-frame invite-panel">
    {#if inAppHint}
      <p class="hint" role="note">
        偵測到 App 內建瀏覽器。若加入後畫面不完整，請改用 Safari／Chrome 開啟本連結。
      </p>
    {/if}
    <p class="lead">
      {#if inviteEntry?.title}
        邀請你玩「{inviteEntry.title}」
      {:else}
        有人邀請你加入這一場
      {/if}
    </p>
    <label class="field">
      <span>顯示名稱</span>
      <input
        class="pixel-input"
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
        class="pixel-btn pixel-btn--primary"
        disabled={busy}
        onclick={() => void onAccept()}
      >
        {busy ? "處理中…" : "同意加入"}
      </button>
      <button type="button" class="pixel-btn" disabled={busy} onclick={onDecline}>
        取消
      </button>
    </div>
  </div>
  {/if}
{:else if showRoomSurface && status}
  <GoRoomSurface
    role="guest"
    phase={status.phase === "connecting" ? "connecting" : "ready"}
    message={status.message}
    error={status.error}
    shortUrl={null}
    inviteExpiresAt={null}
    peerName={null}
    guestCount={status.guestCount ?? 0}
    occupantPeers={status.occupantPeers ?? []}
    directPeerIds={status.directPeerIds ?? []}
    onEnd={() => runtime.leaveRoom()}
    playCatalogId={status.playCatalogId ?? null}
    playLoadProgress={status.playLoadProgress ?? null}
    playCanvasUrl={status.playCanvasUrl ?? null}
    playCanvasSrcdoc={status.playCanvasSrcdoc ?? null}
    playCanvasGeneration={status.playCanvasGeneration ?? 0}
    playHostName={status.occupantPeers[0]?.name ?? null}
    playSpectator={status.playSpectator}
  />
{:else if showCanvas}
  <h1 class="sr-only">邀請</h1>
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
  <h1 class="sr-only">邀請</h1>
  <div class="wait pixel-frame" role="status" aria-live="polite">
    <p class="wait-title">
      {#if status.phase === "loading_sam"}
        正在下載小品
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
    {#if status.message}
      <p class="wait-hint">{status.message}</p>
    {/if}
    {#if status.error}
      <p class="err" role="alert">{status.error}</p>
    {/if}
    {#if status.phase === "loading_sam"}
      <GoSamLoadBar
        progress={status.loadProgress ?? { ratio: null, detail: "準備中…" }}
        label="小品下載進度"
      />
    {/if}
    <p class="wait-hint">遊戲畫面會在入座完成後出現，請勿關閉此頁。</p>
  </div>
{/if}

<style>
  .invite-panel {
    margin: 0 0 1rem;
  }
  .door {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto 1rem;
  }
  .door-screen {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    max-height: 10.5rem;
    overflow: hidden;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: #0a0a10;
    box-shadow: var(--pixel-shadow);
  }
  .door-snow {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(
        0deg,
        #1a1a22 0 1px,
        #0c0c10 1px 3px
      );
    opacity: 0.9;
  }
  .door-scan {
    position: absolute;
    left: 0;
    right: 0;
    height: 28%;
    background: linear-gradient(
      to bottom,
      transparent,
      color-mix(in oklab, rgb(var(--accent)) 28%, transparent),
      transparent
    );
    animation: door-scan 2.4s linear infinite;
    pointer-events: none;
  }
  @keyframes door-scan {
    from {
      transform: translateY(-120%);
    }
    to {
      transform: translateY(420%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .door-scan {
      animation: none;
      opacity: 0.35;
      top: 36%;
    }
  }
  .door-card {
    margin: 0;
    padding: 0.95rem 0.9rem 1rem;
  }
  .door-title {
    margin: 0 0 0.45rem;
    font-size: 1.05rem;
    line-height: 1.3;
  }
  .door-lead {
    margin: 0;
    color: rgb(var(--muted));
    font-size: 0.92rem;
    line-height: 1.45;
  }
  .door .field {
    margin: 0.85rem 0 0;
  }
  .door .actions {
    margin: 0.85rem 0 0;
  }
  .door .pixel-btn {
    min-height: 44px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin: 0.75rem 0 1rem;
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0.75rem 0 0;
  }
  .actions .pixel-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    text-align: center;
  }
  .wait {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.5rem;
    min-height: min(50vh, 20rem);
    text-align: center;
  }
  .wait-title {
    margin: 0;
    font-family: var(--pixel);
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
    border: 2px solid rgb(var(--ink));
    background: rgb(var(--fill));
    color: rgb(var(--muted));
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .lead {
    margin: 0 0 0.5rem;
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
  @media (min-width: 40rem) {
    .actions {
      flex-direction: row;
    }
    .actions .pixel-btn {
      flex: 1;
    }
  }
</style>
