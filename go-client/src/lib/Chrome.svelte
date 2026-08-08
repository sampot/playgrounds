<script lang="ts">
  import { goto } from "$app/navigation";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import GoMorePanel from "$lib/GoMorePanel.svelte";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import { nextSameKind, recommendSameKind } from "$lib/goCatalog";
  import {
    openPlaygroundCatalog,
    openPlaygroundHome,
    PLAY_CATALOG_HREF,
    PLAY_ORIGIN,
  } from "$lib/openPlayground";
  import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { goSamShareTitle } from "$lib/goShareMeta";
  import { getGoCatalogEntry } from "$lib/goCatalog";

  /** Visible host in chrome — playground home, not catalog path (DEC-050 §6.4). */
  const playHost = PLAY_ORIGIN.replace(/^https:\/\//, "");

  function goOrigin(): string {
    if (typeof location !== "undefined" && location.origin) {
      if (
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1" ||
        location.hostname.endsWith(".localhost")
      ) {
        return location.origin;
      }
    }
    return PLAYGROUNDS_GO_ORIGIN;
  }

  const CHROME_AUTO_HIDE_MS = 3000;

  let shareOpen = $state(false);
  let recommends = $state<ReturnType<typeof recommendSameKind>>([]);
  let moreOpen = $state(false);
  /** Canvas play: hide chrome on scroll-down, show on scroll-up. */
  let chromeHidden = $state(false);
  let chromeAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearChromeAutoHide() {
    if (chromeAutoHideTimer != null) {
      clearTimeout(chromeAutoHideTimer);
      chromeAutoHideTimer = null;
    }
  }

  /** After reveal: hide again if header idle for 3s (paused while share／more open). */
  function scheduleChromeAutoHide() {
    clearChromeAutoHide();
    if (!canvasActive || chromeHidden || shareOpen || moreOpen) return;
    chromeAutoHideTimer = setTimeout(() => {
      chromeAutoHideTimer = null;
      if (shareOpen || moreOpen) return;
      chromeHidden = true;
    }, CHROME_AUTO_HIDE_MS);
  }

  function onChromeInteract() {
    if (canvasActive && !chromeHidden) scheduleChromeAutoHide();
  }

  const catalogId = $derived(chromeSession.catalogId);
  const mode = $derived(chromeSession.mode);
  const canvasActive = $derived(chromeSession.canvasActive);
  const shareEnabled = $derived(Boolean(catalogId));
  /** §6.6：本機溢流 — `/`／`/s/`；Invite 不露. */
  const showMore = $derived(mode !== "invite");
  /** §5.6：僅當前小品為 `kind: game` 時露出換片／試試這些. */
  const showSwap = $derived(
    mode === "solo" &&
      Boolean(catalogId) &&
      chromeSession.kind === "game"
  );
  const nextEntry = $derived(catalogId ? nextSameKind(catalogId) : null);

  const shareTitle = $derived.by(() => {
    if (!catalogId) return "";
    const entry =
      getGoCatalogEntry(catalogId) ||
      (chromeSession.title
        ? { title: chromeSession.title }
        : { title: catalogId });
    return goSamShareTitle(entry);
  });

  const shareUrl = $derived(
    catalogId ? goSamShareHref(catalogId, goOrigin()) : ""
  );

  const shareSpoken = $derived.by(() => {
    if (!shareUrl) return "";
    try {
      const u = new URL(shareUrl);
      return `${u.host}${u.pathname}`;
    } catch {
      return shareUrl.replace(/^https?:\/\//, "");
    }
  });

  $effect(() => {
    if (mode === "solo" && catalogId && chromeSession.kind === "game") {
      recommends = recommendSameKind(catalogId, 3);
    } else {
      recommends = [];
    }
  });

  $effect(() => {
    if (!catalogId) shareOpen = false;
  });

  $effect(() => {
    if (mode === "invite") moreOpen = false;
  });

  $effect(() => {
    if (shareOpen || moreOpen) {
      clearChromeAutoHide();
      return;
    }
    if (canvasActive && !chromeHidden) scheduleChromeAutoHide();
  });

  $effect(() => {
    if (!canvasActive) {
      clearChromeAutoHide();
      chromeHidden = false;
      return;
    }

    chromeHidden = false;
    clearChromeAutoHide();

    let acc = 0;
    let touchY = 0;
    const THRESH = 28;
    const boundDocs = new WeakSet<Document>();
    const boundIframes = new WeakSet<HTMLIFrameElement>();
    const cleanups: Array<() => void> = [];

    function setHidden(hidden: boolean) {
      const wasHidden = chromeHidden;
      chromeHidden = hidden;
      if (hidden) {
        clearChromeAutoHide();
      } else if (wasHidden) {
        // Revealed by scroll-up／pull — auto-hide if idle.
        scheduleChromeAutoHide();
      }
      acc = 0;
    }

    function onDelta(dy: number) {
      if (!dy) return;
      // Ignore tiny jitter.
      if (Math.abs(dy) < 2) return;
      acc += dy;
      if (acc > THRESH) setHidden(true);
      else if (acc < -THRESH) setHidden(false);
    }

    function onWheel(e: WheelEvent) {
      onDelta(e.deltaY);
    }

    function onTouchStart(e: TouchEvent) {
      touchY = e.touches[0]?.clientY ?? 0;
    }

    function onTouchMove(e: TouchEvent) {
      const y = e.touches[0]?.clientY ?? touchY;
      // Finger up → content moves down → hide chrome.
      onDelta(touchY - y);
      touchY = y;
    }

    const opts: AddEventListenerOptions = { capture: true, passive: true };

    function bindTarget(target: Document | Window) {
      target.addEventListener("wheel", onWheel as EventListener, opts);
      target.addEventListener("touchstart", onTouchStart as EventListener, opts);
      target.addEventListener("touchmove", onTouchMove as EventListener, opts);
      cleanups.push(() => {
        target.removeEventListener("wheel", onWheel as EventListener, opts);
        target.removeEventListener(
          "touchstart",
          onTouchStart as EventListener,
          opts
        );
        target.removeEventListener(
          "touchmove",
          onTouchMove as EventListener,
          opts
        );
      });
    }

    bindTarget(window);

    function bindIframe(iframe: HTMLIFrameElement) {
      if (boundIframes.has(iframe)) return;
      boundIframes.add(iframe);
      const attach = () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc || boundDocs.has(doc)) return;
          boundDocs.add(doc);
          bindTarget(doc);
        } catch {
          /* cross-origin canvas — parent wheel／touch only */
        }
      };
      iframe.addEventListener("load", attach);
      attach();
      cleanups.push(() => iframe.removeEventListener("load", attach));
    }

    function scanIframes() {
      document
        .querySelectorAll<HTMLIFrameElement>(".main--playing iframe")
        .forEach(bindIframe);
    }

    scanIframes();
    const mo = new MutationObserver(scanIframes);
    const main = document.querySelector(".main--playing");
    if (main) mo.observe(main, { childList: true, subtree: true });
    cleanups.push(() => mo.disconnect());

    return () => {
      for (const c of cleanups) c();
      clearChromeAutoHide();
      chromeHidden = false;
    };
  });

  function openShare() {
    if (!catalogId || !shareUrl) return;
    moreOpen = false;
    clearChromeAutoHide();
    chromeHidden = false;
    shareOpen = true;
  }

  function openMore() {
    shareOpen = false;
    clearChromeAutoHide();
    chromeHidden = false;
    moreOpen = true;
  }

  function goToId(id: string) {
    moreOpen = false;
    shareOpen = false;
    void goto(`/s/${encodeURIComponent(id)}`);
  }
</script>

<div
  class={["chrome-root", canvasActive && "chrome-root--overlay"]
    .filter(Boolean)
    .join(" ")}
>
  <header
    class={[
      "chrome",
      canvasActive && "chrome--compact",
      canvasActive && chromeHidden && "chrome--hidden",
    ]
      .filter(Boolean)
      .join(" ")}
    aria-label="站群"
    aria-hidden={canvasActive && chromeHidden ? "true" : undefined}
    onpointerdown={onChromeInteract}
  >
    <a
      class="mark-link"
      href={`${PLAY_ORIGIN}/`}
      title={`山姆鍋遊樂場（${playHost}）`}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundHome}
    >
      <img
        class="mark"
        src="/favicon.svg"
        width="22"
        height="22"
        alt="山姆鍋"
      />
    </a>
    <a
      class="play-link"
      href={PLAY_CATALOG_HREF}
      title={`山姆鍋遊樂場（${playHost}）· 遊戲小品`}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundCatalog}
    >
      <span class="play-label">山姆鍋遊樂場</span>
      {#if !canvasActive}
        <span class="host">{playHost}</span>
      {/if}
    </a>
    {#if showSwap && canvasActive}
      <button
        type="button"
        class="hdr-next"
        disabled={!nextEntry}
        onclick={() => nextEntry && goToId(nextEntry.id)}
      >
        下一個
      </button>
    {/if}
    {#if showMore}
      <button
        type="button"
        class="hdr-more-btn"
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        onclick={openMore}
      >
        更多
      </button>
    {/if}
    <button
      type="button"
      class="share-btn"
      disabled={!shareEnabled}
      title={shareEnabled ? "分享此小品" : "尚無可分享的小品"}
      onclick={openShare}
    >
      分享
    </button>
  </header>

  {#if chromeSession.flash && !(canvasActive && chromeHidden && !shareOpen && !moreOpen)}
    <p
      class={["chrome-flash", canvasActive && "chrome-flash--toast"]
        .filter(Boolean)
        .join(" ")}
      role="status"
    >
      {chromeSession.flash}
    </p>
  {/if}

  {#if showSwap && !canvasActive}
    <nav class="swap" aria-label="換片">
      <button
        type="button"
        class="swap-next"
        disabled={!nextEntry}
        onclick={() => nextEntry && goToId(nextEntry.id)}
      >
        下一個
      </button>
    </nav>
  {/if}
</div>

{#if shareEnabled && shareUrl}
  <GoShareSheet
    open={shareOpen}
    title={shareTitle}
    url={shareUrl}
    spoken={shareSpoken}
    onClose={() => (shareOpen = false)}
    onFlash={msg => chromeSession.setFlash(msg)}
  />
{/if}

{#if showMore}
  <GoMorePanel
    open={moreOpen}
    currentCatalogId={mode === "solo" ? catalogId : null}
    showTryThese={showSwap}
    {recommends}
    onClose={() => (moreOpen = false)}
    onPick={goToId}
    onFlash={msg => chromeSession.setFlash(msg)}
  />
{/if}
