<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import {
    runClearScores,
    runRemoveOffline,
    runUpdate,
  } from "$lib/goGameActions";
  import GoEntryCover from "$lib/GoEntryCover.svelte";
  import GoAdSlot from "$lib/GoAdSlot.svelte";
  import {
    appsAdSplit,
    appsPageCount,
    appsPageSlice,
    clampAppsPage,
    parseAppsPageParam,
  } from "$lib/goAppsPaging";
  import { clearAllGoProgress } from "$lib/goScoreStorage";
  import { clearAllGoSamOfflineCache, listGoSamOfflineCatalogIds } from "$lib/goSamOfflineCache";

  type ConfirmKind = "scores" | "offline" | "all";
  type AppEntry = { id: string; title: string; series?: string; cover?: string };

  let loading = $state(true);
  let loadError = $state("");
  let busyAction = $state("");
  let expandedId = $state<string | null>(null);
  let confirm = $state<{
    kind: ConfirmKind;
    id: string | null;
    title: string;
  } | null>(null);
  let confirmDialog = $state<HTMLDialogElement | null>(null);
  let cancelButton = $state<HTMLButtonElement | null>(null);
  let confirmOpen = false;

  let apps = $state<AppEntry[]>([]);

  const pageCount = $derived(appsPageCount(apps.length));
  const currentPage = $derived(
    clampAppsPage(
      parseAppsPageParam(page.url.searchParams.get("page")),
      pageCount
    )
  );
  const pageApps = $derived(appsPageSlice(apps, currentPage));
  /** Mid-list ad on the **current page** slice (PG-GO-ADS-PLAN §5.1.1). */
  const adSplit = $derived(appsAdSplit(pageApps.length));
  const showPager = $derived(pageCount > 1);

  async function goToPage(next: number, count: number = pageCount) {
    const clamped = clampAppsPage(next, count);
    expandedId = null;
    const url = new URL(page.url.href);
    if (clamped <= 1) url.searchParams.delete("page");
    else url.searchParams.set("page", String(clamped));
    const nextHref = `${url.pathname}${url.search}${url.hash}`;
    const cur = `${page.url.pathname}${page.url.search}${page.url.hash}`;
    if (nextHref === cur) return;
    await goto(nextHref, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  async function refresh() {
    loading = true;
    loadError = "";
    try {
      const ids = await listGoSamOfflineCatalogIds();
      apps = ids.map((id) => {
        const e = getGoCatalogEntry(id);
        return {
          id,
          title: e?.title ?? id,
          series: e?.series ?? undefined,
          cover: e?.cover,
        };
      });
      const count = appsPageCount(apps.length);
      const wanted = parseAppsPageParam(page.url.searchParams.get("page"));
      const clamped = clampAppsPage(wanted, count);
      if (
        wanted !== clamped ||
        (clamped <= 1 && page.url.searchParams.has("page"))
      ) {
        await goToPage(clamped, count);
      }
    } catch {
      loadError = "無法讀取這台裝置的離線下載，請稍後再試。";
    } finally {
      loading = false;
    }
  }

  function showFlash(message: string) {
    // Sticky chrome header — visible even when the list is scrolled far down.
    chromeSession.setFlash(message, 3200);
  }

  function askClearScores(id: string, title: string) {
    confirm = { kind: "scores", id, title };
  }

  function askRemoveOffline(id: string, title: string) {
    confirm = { kind: "offline", id, title };
  }

  function askClearAll() {
    confirm = { kind: "all", id: null, title: "" };
  }

  function dismissConfirm() {
    if (busyAction) return;
    confirm = null;
  }

  async function updateApp(app: AppEntry) {
    if (busyAction) return;
    const entry = getGoCatalogEntry(app.id);
    if (!entry) {
      showFlash(`找不到「${app.title}」的型錄資料，無法檢查更新`);
      return;
    }
    busyAction = `update:${app.id}`;
    try {
      const result = await runUpdate(entry);
      showFlash(result.flash);
    } catch {
      showFlash(`檢查「${app.title}」更新時發生錯誤`);
    } finally {
      busyAction = "";
    }
  }

  async function runConfirm() {
    if (!confirm || busyAction) return;
    const c = confirm;
    busyAction = `${c.kind}:${c.id ?? "all"}`;
    try {
      if (c.kind === "scores" && c.id) {
        const result = await runClearScores(c.id, c.title);
        showFlash(result.flash);
      } else if (c.kind === "offline" && c.id) {
        const result = await runRemoveOffline(c.id, c.title);
        showFlash(result.flash);
        expandedId = null;
        await refresh();
      } else if (c.kind === "all") {
        const scores = await clearAllGoProgress();
        const packs = await clearAllGoSamOfflineCache();
        confirm = null;
        await goto("/");
        chromeSession.setFlash(
          `已清除全部本機遊戲資料（分數 ${scores} 筆、離線下載 ${packs} 個）`
        );
        return;
      }
      confirm = null;
    } catch {
      showFlash("操作失敗，請稍後再試。");
      confirm = null;
    } finally {
      busyAction = "";
    }
  }

  const confirmCopy = $derived.by(() => {
    if (!confirm) return { title: "", body: "", ok: "" };
    if (confirm.kind === "scores") {
      return {
        title: "清除進度／分數",
        body: `清除「${confirm.title}」在本機的進度與分數？無法復原。`,
        ok: "清除進度",
      };
    }
    if (confirm.kind === "offline") {
      return {
        title: "移除離線下載",
        body: `移除「${confirm.title}」的離線包？下次離線前需再連線載入一次。`,
        ok: "移除下載",
      };
    }
    return {
      title: "清除全部本機遊戲資料",
      body: "清除所有小品的進度／分數與離線下載，並回到首頁。不會清除主題等偏好設定。無法復原。",
      ok: "全部清除",
    };
  });

  function onDialogCancel(e: Event) {
    e.preventDefault();
    dismissConfirm();
  }

  $effect(() => {
    const el = confirmDialog;
    if (!el) return;

    if (confirm) {
      if (!el.open) {
        try {
          el.showModal();
        } catch {
          el.setAttribute("open", "");
        }
      }
      if (!confirmOpen) {
        confirmOpen = true;
        queueMicrotask(() => cancelButton?.focus());
      }
      return;
    }

    confirmOpen = false;
    if (el.open) el.close();
  });

  $effect(() => {
    void refresh();
  });
</script>

<svelte:head>
  <title>可離線玩的遊戲</title>
  <meta name="description" content="管理這台裝置可離線玩的遊戲與小品" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<p class="back">
  <a href="/">← 回純玩首頁</a>
</p>

<header class="page-heading">
  <h1 class="pixel-text">可離線玩的遊戲</h1>
  <p>連線成功載入過的遊戲會保留在這台裝置，之後沒有網路也能再玩。</p>
</header>

<dialog
  bind:this={confirmDialog}
  class="confirm-dialog"
  aria-labelledby="apps-confirm-title"
  oncancel={onDialogCancel}
  onclick={(e) => {
    if (e.target === confirmDialog) dismissConfirm();
  }}
>
  {#if confirm}
    <div class="confirm pixel-frame">
      <h2 id="apps-confirm-title" class="confirm-title">{confirmCopy.title}</h2>
      <p class="confirm-body">{confirmCopy.body}</p>
      <div class="confirm-actions">
        <button
          bind:this={cancelButton}
          type="button"
          class="pixel-btn"
          disabled={Boolean(busyAction)}
          onclick={dismissConfirm}
        >
          取消
        </button>
        <button
          type="button"
          class="pixel-btn pixel-btn--danger"
          disabled={Boolean(busyAction)}
          onclick={() => void runConfirm()}
        >
          {busyAction ? "處理中…" : confirmCopy.ok}
        </button>
      </div>
    </div>
  {/if}
</dialog>

{#if loading}
  <div class="loading pixel-frame" role="status">
    <span class="loading-dot" aria-hidden="true"></span>
    正在讀取離線下載…
  </div>
{:else if loadError}
  <div class="load-error pixel-frame" role="alert">
    <p>{loadError}</p>
    <button type="button" class="pixel-btn" onclick={() => void refresh()}>
      再試一次
    </button>
  </div>
{:else if apps.length === 0}
  <div class="empty-pixel pixel-frame">
    <svg width="72" height="72" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
      <rect x="2" y="4" width="8" height="5" />
      <rect x="3" y="3" width="6" height="1" />
      <rect x="3" y="9" width="6" height="1" />
      <rect x="4" y="6" width="1" height="1" fill="rgb(var(--fill))" />
      <rect x="7" y="6" width="1" height="1" fill="rgb(var(--fill))" />
      <rect x="5" y="7" width="2" height="1" fill="rgb(var(--fill))" />
    </svg>
    <p>還沒有可離線玩的遊戲。連線玩過一次後就會出現在這裡。</p>
    <a class="pixel-btn empty-cta" href="/">回首頁找遊戲</a>
  </div>
{:else}
  <ul class="app-list" aria-label="可離線玩的遊戲">
    {#each pageApps.slice(0, adSplit) as app (app.id)}
      {@render appRow(app)}
    {/each}
    <li class="app-list-ad">
      <GoAdSlot />
    </li>
    {#each pageApps.slice(adSplit) as app (app.id)}
      {@render appRow(app)}
    {/each}
  </ul>

  {#if showPager}
    <nav class="apps-pager" aria-label="分頁">
      <button
        type="button"
        class="pixel-btn apps-pager-btn"
        disabled={currentPage <= 1}
        onclick={() => void goToPage(currentPage - 1)}
      >
        上一頁
      </button>
      <p class="apps-pager-status">
        第 {currentPage}／{pageCount} 頁
        <span class="apps-pager-total">（共 {apps.length} 款）</span>
      </p>
      <button
        type="button"
        class="pixel-btn apps-pager-btn"
        disabled={currentPage >= pageCount}
        onclick={() => void goToPage(currentPage + 1)}
      >
        下一頁
      </button>
    </nav>
  {/if}

  <section class="apps-advanced">
    <h2>進階</h2>
    <button
      type="button"
      class="pixel-btn pixel-btn--danger-outline"
      onclick={askClearAll}
    >
      清除全部本機遊戲資料…
    </button>
  </section>
{/if}

{#snippet appRow(app: AppEntry)}
  <li class="app-row pixel-box">
    <div class="app-summary">
      <span class="app-icon" aria-hidden="true">
        <GoEntryCover cover={app.cover} series={app.series} size={20} />
      </span>
      <div class="app-copy">
        <a class="app-name" href={`/s/${encodeURIComponent(app.id)}`}>
          {app.title}
        </a>
        <span class="offline-status">● 可離線玩</span>
      </div>
      <a class="play-btn pixel-btn" href={`/s/${encodeURIComponent(app.id)}`}>
        開始
      </a>
      <button
        type="button"
        class="manage-btn pixel-btn"
        aria-expanded={expandedId === app.id}
        aria-controls={`app-actions-${app.id}`}
        onclick={() => (expandedId = expandedId === app.id ? null : app.id)}
      >
        {expandedId === app.id ? "收起" : "管理"}
      </button>
    </div>

    {#if expandedId === app.id}
      <div id={`app-actions-${app.id}`} class="app-actions">
        <button
          type="button"
          class="action-btn pixel-btn"
          disabled={Boolean(busyAction)}
          onclick={() => void updateApp(app)}
        >
          {busyAction === `update:${app.id}` ? "檢查中…" : "檢查更新"}
        </button>
        <button
          type="button"
          class="action-btn pixel-btn"
          disabled={Boolean(busyAction)}
          onclick={() => askClearScores(app.id, app.title)}
        >
          清除進度
        </button>
        <button
          type="button"
          class="action-btn pixel-btn pixel-btn--danger-outline"
          disabled={Boolean(busyAction)}
          onclick={() => askRemoveOffline(app.id, app.title)}
        >
          移除離線下載
        </button>
      </div>
    {/if}
  </li>
{/snippet}

<style>
  .back {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
  }
  .back a {
    font-weight: 600;
    text-decoration: none;
  }
  .back a:hover,
  .back a:focus-visible {
    text-decoration: underline;
    outline: none;
  }
  .page-heading {
    margin-bottom: 1rem;
  }
  .page-heading h1 {
    margin: 0 0 0.5rem;
  }
  .page-heading p {
    max-width: 38rem;
    margin: 0;
    color: rgb(var(--muted));
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .loading,
  .load-error {
    padding: 1rem;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .loading {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    color: rgb(var(--muted));
  }
  .loading-dot {
    width: 0.7rem;
    height: 0.7rem;
    flex: 0 0 auto;
    background: rgb(var(--accent));
    animation: loading-blink 0.8s steps(2, end) infinite;
  }
  @keyframes loading-blink {
    50% {
      opacity: 0.25;
    }
  }
  .load-error p {
    margin: 0 0 0.75rem;
  }
  .empty-pixel {
    display: grid;
    justify-items: center;
    gap: 0.8rem;
    padding: 1.25rem;
    text-align: center;
  }
  .empty-pixel p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: rgb(var(--muted));
  }
  .empty-cta {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  /* Top-layer modal: always in the viewport, even when the list is long. */
  .confirm-dialog {
    width: min(100% - 1.5rem, 26rem);
    max-width: calc(100% - 1.5rem);
    margin: auto 0.75rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
  }
  .confirm-dialog::backdrop {
    background: color-mix(in oklab, rgb(var(--ink)) 45%, transparent);
  }
  .confirm {
    margin: 0;
    border-color: rgb(var(--danger, 181 56 56));
    box-shadow: 4px 4px 0 rgb(var(--ink));
  }
  .confirm-title {
    margin: 0 0 0.35rem;
    font-family: var(--pixel);
    font-size: 1rem;
    font-weight: 700;
  }
  .confirm-body {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    line-height: 1.45;
    color: color-mix(in oklab, rgb(var(--ink)) 88%, transparent);
  }
  .confirm-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .confirm-actions button {
    min-height: 44px;
  }

  .app-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .app-list-ad {
    list-style: none;
    margin: 0.15rem 0;
    padding: 0;
    display: flex;
    justify-content: center;
  }
  .app-list-ad :global(.go-ad-slot) {
    margin-top: 0;
  }
  .apps-pager {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;
    align-items: center;
    margin: 1rem 0 0;
    padding: 0.75rem 0;
  }
  .apps-pager-btn {
    min-height: 44px;
    width: 100%;
  }
  .apps-pager-status {
    margin: 0;
    text-align: center;
    font-size: 0.85rem;
    font-family: var(--pixel);
    color: color-mix(in oklab, rgb(var(--ink)) 88%, transparent);
  }
  .apps-pager-total {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.75rem;
    color: rgb(var(--muted));
    font-family: var(--sans);
  }
  .app-row {
    display: block;
    padding: 0.75rem;
    min-width: 0;
  }
  .app-summary {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.65rem;
  }
  .app-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    overflow: hidden;
    border-radius: 2px;
    color: rgb(var(--accent));
    font-size: 1.3rem;
    line-height: 1;
  }
  .app-icon :global(.go-entry-cover--thumb) {
    width: 2.25rem;
    height: 2.25rem;
  }
  .app-copy {
    display: grid;
    min-width: 0;
    gap: 0.2rem;
  }
  .app-name {
    min-width: 0;
    font-weight: 650;
    font-size: 0.95rem;
    color: rgb(var(--ink));
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .app-name:hover,
  .app-name:focus-visible {
    color: rgb(var(--accent));
    outline: none;
  }
  .offline-status {
    color: rgb(var(--muted));
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .play-btn,
  .manage-btn,
  .action-btn {
    min-height: 44px;
  }
  .play-btn {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }
  .manage-btn {
    min-width: 4rem;
  }
  .app-actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 2px dashed color-mix(in oklab, rgb(var(--ink)) 25%, transparent);
  }
  .apps-advanced {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 2px solid color-mix(in oklab, rgb(var(--ink)) 20%, transparent);
  }
  .apps-advanced h2 {
    margin: 0 0 0.65rem;
    font-family: var(--pixel);
    font-size: 0.85rem;
  }
  .apps-advanced button {
    width: 100%;
    min-height: 44px;
  }

  @media (min-width: 42rem) {
    .confirm-dialog {
      margin: auto;
    }
    .apps-pager {
      grid-template-columns: minmax(6.5rem, auto) minmax(0, 1fr) minmax(6.5rem, auto);
      gap: 0.75rem;
    }
    .apps-pager-btn {
      width: auto;
      min-width: 6.5rem;
    }
    .apps-pager-total {
      display: inline;
      margin-top: 0;
      margin-left: 0.35rem;
    }
    .app-actions {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .apps-advanced button {
      width: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-dot {
      animation: none;
    }
  }
</style>
