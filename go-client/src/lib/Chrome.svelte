<script lang="ts">
  import { goto } from "$app/navigation";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import GoMorePanel from "$lib/GoMorePanel.svelte";
  import GoProfilePanel from "$lib/GoProfilePanel.svelte";
  import GoShareSheet from "$lib/GoShareSheet.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { nextSameKind, recommendSameKind } from "$lib/goCatalog";
  import { PLAY_ORIGIN } from "$lib/openPlayground";
  import { goSamShareHref, PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";
  import { goSamShareTitle, GO_SITE_NAME } from "$lib/goShareMeta";
  import { getGoCatalogEntry } from "$lib/goCatalog";

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
  let profileOpen = $state(false);
  /** Canvas play: hide chrome on scroll-down, show on scroll-up. */
  let chromeHidden = $state(false);
  let chromeAutoHideTimer: ReturnType<typeof setTimeout> | null = null;

  function clearChromeAutoHide() {
    if (chromeAutoHideTimer != null) {
      clearTimeout(chromeAutoHideTimer);
      chromeAutoHideTimer = null;
    }
  }

  /** After reveal: hide again if header idle for 3s (paused while share／more／profile open). */
  function scheduleChromeAutoHide() {
    // Idempotent: if a countdown is already pending, don't restart it — an
    // effect that re-runs frequently (e.g. canvas scroll binding) must not
    // keep resetting the 3s timer, or it would never elapse.
    if (chromeAutoHideTimer != null) return;
    if (!chromeHideable || chromeHidden || shareOpen || moreOpen || profileOpen) return;
    chromeAutoHideTimer = setTimeout(() => {
      chromeAutoHideTimer = null;
      if (shareOpen || moreOpen || profileOpen) return;
      chromeHidden = true;
    }, CHROME_AUTO_HIDE_MS);
  }

  function onChromeInteract() {
    if (chromeHideable && !chromeHidden) scheduleChromeAutoHide();
  }

  const catalogId = $derived(chromeSession.catalogId);
  const mode = $derived(chromeSession.mode);
  const canvasActive = $derived(chromeSession.canvasActive);
  /**
   * Header auto-hide applies on canvas play AND on a solo game page: after
   * entering the game the chrome hides after 3s idle (revealed on interact).
   */
  const chromeHideable = $derived(
    canvasActive || (mode === "solo" && chromeSession.kind === "game")
  );
  /** §6.6：本機溢流 — `/`／`/s/`；Invite 不露. */
  const showMore = $derived(mode !== "invite");
  /** 分享：遊戲頁分享該小品；其餘（含首頁）分享 go client 本身. Invite 不露. */
  const shareEnabled = $derived(mode !== "invite");
  /** §5.6：僅當前小品為 `kind: game` 時露出換片／試試這些. */
  const showSwap = $derived(
    mode === "solo" &&
      Boolean(catalogId) &&
      chromeSession.kind === "game"
  );
  const nextEntry = $derived(catalogId ? nextSameKind(catalogId) : null);

  const shareTitle = $derived.by(() => {
    if (!catalogId) return GO_SITE_NAME;
    const entry =
      getGoCatalogEntry(catalogId) ||
      (chromeSession.title
        ? { title: chromeSession.title }
        : { title: catalogId });
    return goSamShareTitle(entry);
  });

  const shareUrl = $derived(
    catalogId ? goSamShareHref(catalogId, goOrigin()) : goOrigin()
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
    if (mode === "invite") {
      shareOpen = false;
      moreOpen = false;
    }
  });

  /**
   * Auto-hide timer owner. Runs whenever hideability／visibility／panel state
   * changes; uses a null-guard so a frequently re-running effect (canvas
   * scroll binding re-binds often) never resets the 3s countdown. The timer is
   * cleared only when leaving a hideable context or when a panel opens.
   */
  $effect(() => {
    const panelOpen = shareOpen || moreOpen || profileOpen;
    if (!chromeHideable || chromeHidden || panelOpen) {
      clearChromeAutoHide();
      if (!chromeHideable) chromeHidden = false;
      return;
    }
    if (chromeAutoHideTimer == null) {
      chromeAutoHideTimer = setTimeout(() => {
        chromeAutoHideTimer = null;
        if (!(shareOpen || moreOpen || profileOpen)) chromeHidden = true;
      }, CHROME_AUTO_HIDE_MS);
    }
  });

  // Scroll/gesture listener binding for chrome hide/reveal. Bound once while
  // hideable (timer lifecycle is owned by the auto-hide effect above). Using an
  // outer handle avoids re-binding on every internal effect re-run, which would
  // reset gesture accumulation and leak listeners.
  let scrollTeardown: (() => void) | null = null;
  $effect(() => {
    if (!chromeHideable) {
      if (scrollTeardown) {
        scrollTeardown();
        scrollTeardown = null;
      }
      return;
    }
    if (scrollTeardown) return; // already bound for this hideable session

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

    scrollTeardown = () => {
      for (const c of cleanups) c();
    };
    return () => {
      if (scrollTeardown) {
        const t = scrollTeardown;
        scrollTeardown = null;
        t();
      }
    };
  });
  // On a solo game page (no canvas scroll), reveal the hidden chrome on any
  // page tap — mirrors canvas scroll-up reveal. Canvas uses its own gesture
  // binding above, so skip when canvas is active.
  $effect(() => {
    if (!chromeHideable || canvasActive) return;
    function onDocPointer(e: PointerEvent) {
      // Ignore taps that originate inside the chrome itself (handled there).
      const t = e.target as Node | null;
      if (t && document.querySelector(".chrome")?.contains(t)) return;
      if (chromeHidden) {
        chromeHidden = false;
        scheduleChromeAutoHide();
      }
    }
    document.addEventListener("pointerdown", onDocPointer, true);
    return () => document.removeEventListener("pointerdown", onDocPointer, true);
  });

  function openShare() {
    if (!shareEnabled || !shareUrl) return;
    moreOpen = false;
    profileOpen = false;
    clearChromeAutoHide();
    chromeHidden = false;
    shareOpen = true;
  }

  function openMore() {
    shareOpen = false;
    profileOpen = false;
    clearChromeAutoHide();
    chromeHidden = false;
    moreOpen = true;
  }

  function openProfile() {
    shareOpen = false;
    moreOpen = false;
    clearChromeAutoHide();
    chromeHidden = false;
    profileOpen = true;
  }

  function onProfileClick() {
    if (!goAuth.loggedIn) {
      goAuth.login();
      return;
    }
    openProfile();
  }

  function goToId(id: string) {
    moreOpen = false;
    shareOpen = false;
    void goto(`/s/${encodeURIComponent(id)}`);
  }

  function goHomeAfterClearAll(flash: string) {
    moreOpen = false;
    shareOpen = false;
    void goto("/").then(() => {
      chromeSession.setFlash(flash);
    });
  }

  function goHomeAfterRemovedOffline(flash: string) {
    moreOpen = false;
    shareOpen = false;
    void goto("/").then(() => {
      chromeSession.setFlash(flash);
    });
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
      chromeHideable && chromeHidden && "chrome--hidden",
    ]
      .filter(Boolean)
      .join(" ")}
    aria-label="站群"
    aria-hidden={chromeHideable && chromeHidden ? "true" : undefined}
    onpointerdown={onChromeInteract}
  >
    <a
      class="mark-link"
      href="/"
      title="純玩首頁"
      onclick={() => {
        moreOpen = false;
        shareOpen = false;
        profileOpen = false;
      }}
    >
      <img
        class="mark"
        src="/favicon.svg"
        width="22"
        height="22"
        alt="純玩"
      />
    </a>
    <a
      class="play-link"
      href="/"
      title="純玩首頁"
      onclick={() => {
        moreOpen = false;
        shareOpen = false;
        profileOpen = false;
      }}
    >
      <span class="play-label">山姆鍋遊樂場</span>
    </a>
    <div class="chrome-actions">
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
      title={shareEnabled
        ? catalogId
          ? "分享此小品"
          : "分享純玩首頁"
        : "邀請中不支援分享"}
      onclick={openShare}
    >
      分享
    </button>
    {#if goAuth.loggedIn}
      <button
        type="button"
        class={["profile-btn", "profile-btn--logged"]
          .filter(Boolean)
          .join(" ")}
        aria-expanded={profileOpen}
        aria-haspopup="dialog"
        aria-label="查看身分"
        title="查看身分"
        onclick={onProfileClick}
      >
        {#if goAuth.profile?.avatar_url}
          <img
            class="profile-avatar"
            src={goAuth.profile.avatar_url}
            alt="已登入"
            width="26"
            height="26"
            referrerpolicy="no-referrer"
          />
        {:else}
          <span
            class={["profile-glyph", "profile-glyph--logged"]
              .filter(Boolean)
              .join(" ")}
          >
            <svg
              class="profile-icon"
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-3.3 3.6-5.5 8-5.5s8 2.2 8 5.5" />
            </svg>
          </span>
          <span class="profile-status" aria-hidden="true"></span>
        {/if}
      </button>
    {:else}
      <button
        type="button"
        class="profile-btn profile-btn--login"
        aria-label="登入"
        onclick={onProfileClick}
      >
         登入
      </button>
    {/if}
    </div>
  </header>

  {#if chromeSession.flash && !(canvasActive && chromeHidden && !shareOpen && !moreOpen && !profileOpen)}
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
      onClearedAll={goHomeAfterClearAll}
      onRemovedOffline={goHomeAfterRemovedOffline}
  />
{/if}

<GoProfilePanel open={profileOpen} onClose={() => (profileOpen = false)} />
