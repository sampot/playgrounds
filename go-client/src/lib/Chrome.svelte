<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { nextSameKind, recommendSameKind } from "$lib/goCatalog";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
  import {
    canUseWebShare,
    isShareAbort,
    shareOrCopy,
  } from "@utils/shareOrCopy";
  import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { goSamShareTitle } from "$lib/goShareMeta";
  import { getGoCatalogEntry } from "$lib/goCatalog";

  const playHost = PLAY_ORIGIN.replace(/^https:\/\//, "");

  let shareBusy = $state(false);
  let canShare = $state(false);
  let recommends = $state<ReturnType<typeof recommendSameKind>>([]);
  let moreOpen = $state(false);
  /** Canvas play: hide chrome on scroll-down, show on scroll-up. */
  let chromeHidden = $state(false);

  const catalogId = $derived(chromeSession.catalogId);
  const mode = $derived(chromeSession.mode);
  const canvasActive = $derived(chromeSession.canvasActive);
  const shareEnabled = $derived(Boolean(catalogId));
  const shareLabel = $derived(canShare ? "分享" : "複製連結");
  const showSwap = $derived(mode === "solo" && Boolean(catalogId));
  const nextEntry = $derived(catalogId ? nextSameKind(catalogId) : null);

  $effect(() => {
    if (mode === "solo" && catalogId) {
      recommends = recommendSameKind(catalogId, 3);
      moreOpen = false;
    } else {
      recommends = [];
      moreOpen = false;
    }
  });

  $effect(() => {
    if (!canvasActive) {
      chromeHidden = false;
      moreOpen = false;
      return;
    }

    chromeHidden = false;
    moreOpen = false;

    let acc = 0;
    let touchY = 0;
    const THRESH = 28;
    const boundDocs = new WeakSet<Document>();
    const boundIframes = new WeakSet<HTMLIFrameElement>();
    const cleanups: Array<() => void> = [];

    function setHidden(hidden: boolean) {
      chromeHidden = hidden;
      if (hidden) moreOpen = false;
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
      chromeHidden = false;
    };
  });

  onMount(() => {
    canShare = canUseWebShare();
  });

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

  async function onShare() {
    if (!catalogId || shareBusy) return;
    shareBusy = true;
    try {
      const url = goSamShareHref(catalogId, goOrigin());
      const entry =
        getGoCatalogEntry(catalogId) ||
        (chromeSession.title
          ? { title: chromeSession.title }
          : { title: catalogId });
      const title = goSamShareTitle(entry);
      const result = await shareOrCopy({ title, url });
      chromeSession.setFlash(
        result === "shared" ? `已分享「${title}」` : `已複製連結（${title}）`
      );
    } catch (e) {
      if (isShareAbort(e)) return;
      chromeSession.setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      shareBusy = false;
    }
  }

  function goToId(id: string) {
    moreOpen = false;
    void goto(`/s/${encodeURIComponent(id)}`);
  }
</script>

<div
  class={["chrome-root", canvasActive && "chrome-root--overlay"]
    .filter(Boolean)
    .join(" ")}
>
  {#if canvasActive}
    <!-- Pinned: stays top-left while the rest of chrome slides away. -->
    <a
      class={[
        "chrome-mark-pin",
        chromeHidden && "chrome-mark-pin--alone",
      ]
        .filter(Boolean)
        .join(" ")}
      href={`${PLAY_ORIGIN}/`}
      title={`山姆鍋遊樂場（${playHost}）`}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundHome}
    >
      <img class="mark" src="/favicon.svg" width="22" height="22" alt="山姆鍋" />
    </a>
  {/if}
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
  >
    {#if !canvasActive}
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
    {:else}
      <span class="mark-spacer" aria-hidden="true"></span>
    {/if}
    <a
      class="play-link"
      href={`${PLAY_ORIGIN}/`}
      title={`山姆鍋遊樂場（${playHost}）`}
      target="_blank"
      rel="noopener noreferrer"
      onclick={openPlaygroundHome}
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
      {#if recommends.length}
        <div class="hdr-more">
          <button
            type="button"
            class="hdr-more-btn"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            onclick={() => (moreOpen = !moreOpen)}
          >
            更多
          </button>
          {#if moreOpen}
            <ul class="hdr-menu" role="menu">
              {#each recommends as rec (rec.id)}
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    class="hdr-menu-item"
                    onclick={() => goToId(rec.id)}>{rec.title}</button
                  >
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    {/if}
    <button
      type="button"
      class="share-btn"
      disabled={!shareEnabled || shareBusy}
      title={shareEnabled ? "分享此小品" : "尚無可分享的小品"}
      onclick={() => void onShare()}
    >
      {shareLabel}
    </button>
  </header>

  {#if chromeSession.flash && !(canvasActive && chromeHidden)}
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
      {#if recommends.length}
        <ul class="swap-rec">
          {#each recommends as rec (rec.id)}
            <li>
              <button
                type="button"
                class="swap-chip"
                onclick={() => goToId(rec.id)}>{rec.title}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </nav>
  {/if}
</div>
