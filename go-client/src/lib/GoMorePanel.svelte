<script lang="ts">
  import type { GoCatalogEntry } from "$lib/goCatalog";
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import { goTheme } from "$lib/goTheme.svelte";
  import GoEntryCover from "$lib/GoEntryCover.svelte";
  import {
    clearAllGoSamOfflineCache,
  } from "$lib/goSamOfflineCache";
  import {
    clearAllGoProgress,
  } from "$lib/goScoreStorage";
  import {
    runClearScores,
    runRemoveOffline,
    runUpdate,
  } from "$lib/goGameActions";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import GoSamLoadBar from "$lib/GoSamLoadBar.svelte";
  import {
    goLoadProgressFromFiles,
    type GoLoadProgress,
  } from "$lib/goLoadProgress";

  type Props = {
    open: boolean;
    /** Solo `/s/` current id — clear「這個遊戲」; null on home. */
    currentCatalogId: string | null;
    showTryThese: boolean;
    recommends: GoCatalogEntry[];
    onClose: () => void;
    onPick: (catalogId: string) => void;
    onFlash: (msg: string) => void;
    /**
     * After clear-all succeeds — navigate home then show flash
     * (page leave clears session flash).
     */
    onClearedAll?: (flash: string) => void;
    /**
     * After this game's offline pack is removed — navigate home then show flash
     * (page leave clears session flash).
     */
    onRemovedOffline?: (flash: string) => void;
  };

  let {
    open,
    currentCatalogId,
    showTryThese,
    recommends,
    onClose,
    onPick,
    onFlash,
    onClearedAll,
    onRemovedOffline,
  }: Props = $props();

  type ConfirmKind = "scores" | "offline" | "all";

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let actionBusy = $state(false);
  let updateProgress = $state<GoLoadProgress | null>(null);
  let confirm = $state<{
    kind: ConfirmKind;
    id: string | null;
    title: string;
  } | null>(null);
  /** Avoid re-entrant refresh／focus while panel stays open. */
  let wasOpen = false;

  const currentTitle = $derived.by(() => {
    const id = currentCatalogId?.trim() ?? "";
    if (!id) return "";
    return getGoCatalogEntry(id)?.title ?? id;
  });

  $effect(() => {
    const el = dialogEl;
    if (!el) return;

    if (open) {
      if (!el.open) {
        try {
          el.showModal();
        } catch {
          el.setAttribute("open", "");
        }
      }
      if (!wasOpen) {
        wasOpen = true;
        confirm = null;
        queueMicrotask(() => {
          el.querySelector<HTMLButtonElement>(".go-more-close")?.focus();
        });
      }
      return;
    }

    wasOpen = false;
    if (el.open) {
      el.close();
    }
    confirm = null;
  });

  function onDialogCancel(e: Event) {
    e.preventDefault();
    if (confirm) {
      confirm = null;
      return;
    }
    onClose();
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

  async function runConfirm() {
    if (!confirm || actionBusy) return;
    actionBusy = true;
    const c = confirm;
    try {
      if (c.kind === "scores" && c.id) {
        const r = await runClearScores(c.id, c.title);
        onFlash(r.flash);
      } else if (c.kind === "offline" && c.id) {
        const r = await runRemoveOffline(c.id, c.title);
        confirm = null;
        onClose();
        if (onRemovedOffline) onRemovedOffline(r.flash);
        else onFlash(r.flash);
        return;
      } else if (c.kind === "all") {
        const scores = await clearAllGoProgress();
        const packs = await clearAllGoSamOfflineCache();
        const flash = `已清除全部本機遊戲資料（分數 ${scores} 筆、已下載遊戲 ${packs} 個）`;
        confirm = null;
        onClose();
        if (onClearedAll) onClearedAll(flash);
        else onFlash(flash);
        return;
      }
      confirm = null;
    } finally {
      actionBusy = false;
    }
  }

  async function onUpdate() {
    if (!currentCatalogId || actionBusy) return;
    actionBusy = true;
    updateProgress = { ratio: null, detail: "正在檢查版本…" };
    try {
      const entry = getGoCatalogEntry(currentCatalogId);
      if (!entry) {
        onFlash(`找不到「${currentTitle || currentCatalogId}」的型錄資料`);
        return;
      }
      const r = await runUpdate(entry, {
        onProgress: progress => {
          updateProgress = goLoadProgressFromFiles(progress);
        },
      });
      onFlash(r.flash);
      if (r.ok && r.changed) {
        onClose();
        chromeSession.requestGameReload();
      }
    } finally {
      actionBusy = false;
      updateProgress = null;
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
        title: "刪除遊戲",
        body: `從這台裝置刪除「${confirm.title}」？已儲存的進度與分數不受影響；下次開啟需要連線重新下載。`,
        ok: "刪除遊戲",
      };
    }
    return {
      title: "清除全部本機遊戲資料",
      body: "清除所有遊戲的進度／分數與已下載內容，並回到首頁。不會清除主題等偏好設定。無法復原。",
      ok: "全部清除",
    };
  });
</script>

<dialog
  bind:this={dialogEl}
  class="go-more"
  aria-labelledby="go-more-title"
  oncancel={onDialogCancel}
  onclick={e => {
    if (e.target === dialogEl) {
      if (confirm) confirm = null;
      else onClose();
    }
  }}
>
  <div class="go-more-panel">
    <header class="go-more-head">
      <div class="go-more-heading">
        <h2 id="go-more-title" class="go-more-title">更多</h2>
        <p class="go-more-sub">殼層 · 本機與設定</p>
      </div>
      <button
        type="button"
        class="go-more-close"
        onclick={onClose}
        aria-label="關閉"
      >
        關閉
      </button>
    </header>

    <div class="go-more-body">
      {#if confirm}
        <div
          class="go-more-confirm"
          role="alertdialog"
          aria-labelledby="go-more-confirm-title"
        >
          <h3 id="go-more-confirm-title" class="go-more-section-title">
            {confirmCopy.title}
          </h3>
          <p class="go-more-confirm-body">{confirmCopy.body}</p>
          <div class="go-more-confirm-actions">
            <button
              type="button"
              class="go-more-btn"
              disabled={actionBusy}
              onclick={() => (confirm = null)}
            >
              取消
            </button>
            <button
              type="button"
              class="go-more-btn go-more-btn--danger"
              disabled={actionBusy}
              onclick={() => void runConfirm()}
            >
              {confirmCopy.ok}
            </button>
          </div>
        </div>
      {:else}
        {#if showTryThese && recommends.length}
          <section
            class="go-more-section"
            aria-labelledby="go-more-try-title"
          >
            <h3 id="go-more-try-title" class="go-more-section-title">
              試試這些
            </h3>
            <ul class="go-more-try">
              {#each recommends as rec (rec.id)}
                <li>
                  <button
                    type="button"
                    class="go-more-btn go-more-btn--icon"
                    onclick={() => onPick(rec.id)}
                  >
                    <span class="go-more-btn-icon" aria-hidden="true">
                      <GoEntryCover
                        cover={rec.cover}
                        series={rec.series}
                        size={20}
                      />
                    </span>
                    <span class="go-more-btn-label">{rec.title}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <section class="go-more-section" aria-labelledby="go-more-theme-title">
          <h3 id="go-more-theme-title" class="go-more-section-title">
            顯示
          </h3>
          <button
            type="button"
            class="go-more-btn go-more-theme-toggle"
            onclick={() => goTheme.toggle()}
            aria-pressed={goTheme.current === "dark"}
          >
            <span class="go-more-theme-icon" aria-hidden="true"
              >{goTheme.current === "dark" ? "🌙" : "☀️"}</span
            >
            <span class="go-more-theme-label">
              畫面色系：{goTheme.current === "dark" ? "深色" : "淺色"}
            </span>
          </button>
        </section>

        <section class="go-more-section" aria-labelledby="go-more-apps-title">
          <h3 id="go-more-apps-title" class="go-more-section-title">
            已下載的遊戲
          </h3>
          <a class="go-more-btn go-more-link" href="/apps" onclick={onClose}>
            管理已下載的遊戲
          </a>
        </section>

        {#if currentCatalogId}
          <section class="go-more-section" aria-labelledby="go-more-cur-title">
            <h3 id="go-more-cur-title" class="go-more-section-title">
              這個遊戲
            </h3>
            <p class="go-more-hint">{currentTitle}</p>
            <div class="go-more-stack">
              <button
                type="button"
                class="go-more-btn"
                disabled={actionBusy}
                onclick={() =>
                  askClearScores(
                    currentCatalogId,
                    currentTitle || currentCatalogId
                  )}
              >
                清除進度
              </button>
              <button
                type="button"
                class="go-more-btn"
                disabled={actionBusy}
                onclick={() =>
                  askRemoveOffline(
                    currentCatalogId,
                    currentTitle || currentCatalogId
                  )}
              >
                刪除遊戲
              </button>
              <button
                type="button"
                class="go-more-btn"
                disabled={actionBusy}
                onclick={() => void onUpdate()}
              >
                {actionBusy ? "更新中…" : "更新遊戲"}
              </button>
              <GoSamLoadBar progress={updateProgress} label="遊戲更新進度" />
            </div>
          </section>
        {/if}

        <section class="go-more-section" aria-labelledby="go-more-help-title">
          <h3 id="go-more-help-title" class="go-more-section-title">說明</h3>
          <a class="go-more-btn go-more-link" href="/help" onclick={onClose}>
            使用說明
          </a>
        </section>

        <section class="go-more-section" aria-labelledby="go-more-adv-title">
          <h3 id="go-more-adv-title" class="go-more-section-title">進階</h3>
          <button
            type="button"
            class="go-more-btn go-more-btn--danger-outline"
            onclick={askClearAll}
          >
            清除全部本機遊戲資料…
          </button>
        </section>
      {/if}
    </div>
  </div>
</dialog>

<style>
  .go-more {
    --gm-fill: var(--fill, 248 250 249);
    --gm-ink: var(--ink, 28 35 33);
    --gm-accent: var(--accent, 15 118 110);
    --gm-line: var(--line, 214 222 219);
    --gm-muted: var(--muted, 100 116 112);
    --gm-danger: 180 35 45;
    --gm-radius: var(--radius, 8px);
    margin: 0;
    padding: 0;
    border: none;
    max-width: none;
    width: 100%;
    max-height: min(92svh, 40rem);
    background: transparent;
    color: rgb(var(--gm-ink));
  }
  .go-more::backdrop {
    background: color-mix(in oklab, rgb(var(--gm-ink)) 45%, transparent);
  }
  .go-more[open] {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: 100vw;
    height: 100%;
    max-height: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  .go-more-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    /* Cap height so body can scroll; min-height:0 is required for iOS flex overflow. */
    flex: 0 1 auto;
    min-height: 0;
    max-height: min(88svh, 36rem);
    border: var(--pixel-edge) solid rgb(var(--gm-ink));
    border-bottom: none;
    border-radius: calc(var(--gm-radius) + 0.35rem)
      calc(var(--gm-radius) + 0.35rem) 0 0;
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, rgb(var(--gold-soft)) 14%, transparent) 0,
        transparent 28%
      ),
      rgb(var(--gm-fill));
    box-shadow: 0 -6px 0 0 rgb(var(--gm-ink)),
      0 -12px 24px color-mix(in oklab, rgb(var(--gm-ink)) 22%, transparent);
    overflow: hidden;
  }
  .go-more-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    min-width: 0;
    padding: 1rem 1rem 0.5rem;
    border-bottom: 2px solid color-mix(in oklab, rgb(var(--gm-ink)) 18%, transparent);
  }
  .go-more-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
    padding: 0.5rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .go-more-title {
    margin: 0;
    font-family: var(--pixel);
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1.3;
    text-shadow: var(--pixel-text-shadow);
  }
  .go-more-heading {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .go-more-sub {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 500;
    color: color-mix(in oklab, rgb(var(--gm-ink)) 62%, transparent);
    line-height: 1.3;
  }
  .go-more-close {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--gm-ink));
    border-radius: var(--gm-radius);
    background: rgb(var(--gm-fill));
    color: rgb(var(--gm-ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 3px 0 0 rgb(var(--gm-ink));
  }
  .go-more-close:hover,
  .go-more-close:focus-visible {
    border-color: rgb(var(--gm-accent));
    color: rgb(var(--gm-accent));
    outline: none;
  }
  .go-more-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.65rem 0.7rem;
    border: 2px solid color-mix(in oklab, rgb(var(--gm-ink)) 55%, transparent);
    border-radius: var(--gm-radius);
    background: color-mix(in oklab, rgb(var(--card)) 55%, rgb(var(--gm-fill)));
  }
  .go-more-section-title {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgb(var(--gm-muted));
  }
  .go-more-section-title::before {
    content: "▸ ";
    color: rgb(var(--gold));
  }
  .go-more-hint,
  .go-more-confirm-body {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
    color: rgb(var(--gm-muted));
  }
  .go-more-try {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .go-more-stack {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
  }
  .go-more-stack .go-more-btn {
    flex: 1;
  }
  .go-more-btn,
  .go-more-link {
    min-height: 2.75rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--gm-ink));
    border-radius: var(--gm-radius);
    background: rgb(var(--gm-fill));
    color: rgb(var(--gm-ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    text-align: start;
    box-sizing: border-box;
    box-shadow: 0 3px 0 0 rgb(var(--gm-ink));
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2),
      border-color 0.12s steps(2);
  }
  .go-more-link {
    display: flex;
    align-items: center;
    text-decoration: none;
  }
  .go-more-btn:hover:not(:disabled),
  .go-more-btn:focus-visible:not(:disabled),
  .go-more-link:hover,
  .go-more-link:focus-visible {
    border-color: rgb(var(--gm-accent));
    color: rgb(var(--gm-accent));
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .go-more-btn:active:not(:disabled),
  .go-more-link:active {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--gm-ink));
  }
  .go-more-btn--icon {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    text-align: start;
  }
  .go-more-theme-toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    text-align: start;
  }
  .go-more-theme-icon {
    flex-shrink: 0;
    font-size: 1.25rem;
    line-height: 1;
  }
  .go-more-theme-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go-more-btn-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    overflow: hidden;
    border-radius: 2px;
    color: rgb(var(--gm-accent));
    font-size: 1.25rem;
    line-height: 1;
  }
  .go-more-btn-icon :global(.go-entry-cover--thumb) {
    width: 1.5rem;
    height: 1.5rem;
  }
  .go-more-btn-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go-more-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .go-more-btn--danger {
    background: rgb(var(--gm-danger));
    border-color: rgb(var(--gm-ink));
    color: #fff;
    text-align: center;
  }
  .go-more-btn--danger:hover:not(:disabled),
  .go-more-btn--danger:focus-visible:not(:disabled) {
    filter: brightness(1.08);
    color: #fff;
  }
  .go-more-btn--danger-outline {
    border-color: rgb(var(--gm-danger));
    color: rgb(var(--gm-danger));
  }
  .go-more-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .go-more-confirm-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .go-more-confirm-actions .go-more-btn {
    text-align: center;
  }

  @media (min-width: 48rem) {
    .go-more[open] {
      align-items: flex-end;
      justify-content: flex-start;
      padding: 4.75rem 1rem 1rem;
    }
    .go-more-panel {
      width: min(28rem, calc(100vw - 2rem));
      margin: 0;
      max-height: min(calc(100svh - 5.75rem), 36rem);
      border-bottom: var(--pixel-edge) solid rgb(var(--gm-ink));
      border-radius: calc(var(--gm-radius) + 0.35rem);
      box-shadow: 0 6px 0 0 rgb(var(--gm-ink)),
        0 12px 24px color-mix(in oklab, rgb(var(--gm-ink)) 22%, transparent);
    }

    @supports (position-anchor: --go-more-trigger) {
      .go-more-panel {
        position: fixed;
        position-anchor: --go-more-trigger;
        top: calc(anchor(bottom) + 0.6rem);
        left: anchor(right);
        translate: -100% 0;
      }
    }
  }
</style>
