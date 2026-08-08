<script lang="ts">
  import type { GoCatalogEntry } from "$lib/goCatalog";
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import {
    clearAllGoSamOfflineCache,
    deleteGoSamOfflineCache,
    listGoSamOfflineCatalogIds,
  } from "$lib/goSamOfflineCache";
  import {
    clearAllGoScores,
    clearGoScoresForCatalog,
  } from "$lib/goScoreStorage";

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
  }: Props = $props();

  type DownloadedRow = { id: string; title: string };
  type ConfirmKind = "scores" | "offline" | "all";

  let dialogEl = $state<HTMLDialogElement | null>(null);
  let downloaded = $state<DownloadedRow[]>([]);
  let listBusy = $state(false);
  let actionBusy = $state(false);
  let confirm = $state<{
    kind: ConfirmKind;
    id: string | null;
    title: string;
  } | null>(null);

  const currentTitle = $derived.by(() => {
    const id = currentCatalogId?.trim() ?? "";
    if (!id) return "";
    return getGoCatalogEntry(id)?.title ?? id;
  });

  async function refreshDownloaded() {
    listBusy = true;
    try {
      const ids = await listGoSamOfflineCatalogIds();
      downloaded = ids.map(id => ({
        id,
        title: getGoCatalogEntry(id)?.title ?? id,
      }));
    } finally {
      listBusy = false;
    }
  }

  $effect(() => {
    const el = dialogEl;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
      void refreshDownloaded();
      confirm = null;
      queueMicrotask(() => {
        el.querySelector<HTMLButtonElement>(".go-more-close")?.focus();
      });
    } else if (el.open) {
      el.close();
      confirm = null;
    }
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
        const n = clearGoScoresForCatalog(c.id);
        onFlash(
          n > 0
            ? `已清除「${c.title}」的進度／分數`
            : `「${c.title}」沒有可清除的進度／分數`
        );
      } else if (c.kind === "offline" && c.id) {
        const ok = await deleteGoSamOfflineCache(c.id);
        onFlash(
          ok
            ? `已移除「${c.title}」的離線下載`
            : `找不到「${c.title}」的離線下載`
        );
        await refreshDownloaded();
      } else if (c.kind === "all") {
        const scores = clearAllGoScores();
        const packs = await clearAllGoSamOfflineCache();
        const flash = `已清除全部本機遊戲資料（分數 ${scores} 筆、離線包 ${packs} 個）`;
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
      <h2 id="go-more-title" class="go-more-title">更多</h2>
      <button
        type="button"
        class="go-more-close"
        onclick={onClose}
        aria-label="關閉"
      >
        關閉
      </button>
    </header>

    {#if confirm}
      <div class="go-more-confirm" role="alertdialog" aria-labelledby="go-more-confirm-title">
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
      <section class="go-more-section" aria-labelledby="go-more-dl-title">
        <h3 id="go-more-dl-title" class="go-more-section-title">可離線玩</h3>
        {#if listBusy && !downloaded.length}
          <p class="go-more-empty">載入中…</p>
        {:else if !downloaded.length}
          <p class="go-more-empty">連線玩過一次後會出現在這裡。</p>
        {:else}
          <ul class="go-more-list">
            {#each downloaded as row (row.id)}
              <li class="go-more-row">
                <button
                  type="button"
                  class="go-more-row-main"
                  onclick={() => onPick(row.id)}
                >
                  {row.title}
                </button>
                <button
                  type="button"
                  class="go-more-row-act"
                  title={`清除「${row.title}」進度／分數`}
                  aria-label={`清除「${row.title}」進度／分數`}
                  onclick={() => askClearScores(row.id, row.title)}
                >
                  清分
                </button>
                <button
                  type="button"
                  class="go-more-row-act"
                  title={`移除「${row.title}」離線下載`}
                  aria-label={`移除「${row.title}」離線下載`}
                  onclick={() => askRemoveOffline(row.id, row.title)}
                >
                  卸包
                </button>
              </li>
            {/each}
          </ul>
        {/if}
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
              onclick={() =>
                askClearScores(currentCatalogId, currentTitle || currentCatalogId)}
            >
              清除進度／分數
            </button>
            <button
              type="button"
              class="go-more-btn"
              onclick={() =>
                askRemoveOffline(
                  currentCatalogId,
                  currentTitle || currentCatalogId
                )}
            >
              移除離線下載
            </button>
          </div>
        </section>
      {/if}

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

      {#if showTryThese && recommends.length}
        <section class="go-more-section go-more-section--try" aria-labelledby="go-more-try-title">
          <h3 id="go-more-try-title" class="go-more-section-title">試試這些</h3>
          <ul class="go-more-try">
            {#each recommends as rec (rec.id)}
              <li>
                <button
                  type="button"
                  class="go-more-btn"
                  onclick={() => onPick(rec.id)}
                >
                  {rec.title}
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    {/if}
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
    --gm-radius: 0.5rem;
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
  }
  .go-more-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
    max-height: min(92svh, 40rem);
    overflow: auto;
    padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
    border: 1px solid rgb(var(--gm-line));
    border-bottom: none;
    border-radius: calc(var(--gm-radius) + 0.35rem)
      calc(var(--gm-radius) + 0.35rem) 0 0;
    background: rgb(var(--gm-fill));
    box-shadow: 0 -8px 28px color-mix(in oklab, rgb(var(--gm-ink)) 16%, transparent);
  }
  .go-more-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .go-more-title {
    margin: 0;
    flex: 1;
    font-size: 1.05rem;
    font-weight: 700;
    line-height: 1.3;
  }
  .go-more-close {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid rgb(var(--gm-line));
    border-radius: var(--gm-radius);
    background: rgb(var(--gm-fill));
    color: rgb(var(--gm-ink));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
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
  }
  .go-more-section--try {
    padding-top: 0.75rem;
    border-top: 1px solid rgb(var(--gm-line));
  }
  .go-more-section-title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgb(var(--gm-muted));
  }
  .go-more-empty,
  .go-more-hint,
  .go-more-confirm-body {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.45;
    color: rgb(var(--gm-muted));
  }
  .go-more-list,
  .go-more-try {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .go-more-row {
    display: flex;
    align-items: stretch;
    gap: 0.25rem;
    min-width: 0;
  }
  .go-more-row-main {
    flex: 1;
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.45rem 0.75rem;
    border: 1px solid rgb(var(--gm-line));
    border-radius: var(--gm-radius);
    background: rgb(var(--gm-fill));
    color: rgb(var(--gm-ink));
    font: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: start;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .go-more-row-main:hover,
  .go-more-row-main:focus-visible {
    border-color: rgb(var(--gm-accent));
    color: rgb(var(--gm-accent));
    outline: none;
  }
  .go-more-row-act {
    flex-shrink: 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0.25rem 0.45rem;
    border: 1px solid rgb(var(--gm-line));
    border-radius: var(--gm-radius);
    background: transparent;
    color: rgb(var(--gm-muted));
    font: inherit;
    font-size: 0.7rem;
    font-weight: 650;
    cursor: pointer;
  }
  .go-more-row-act:hover,
  .go-more-row-act:focus-visible {
    border-color: rgb(var(--gm-accent));
    color: rgb(var(--gm-accent));
    outline: none;
  }
  .go-more-stack {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .go-more-btn {
    min-height: 2.75rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: 1px solid rgb(var(--gm-line));
    border-radius: var(--gm-radius);
    background: rgb(var(--gm-fill));
    color: rgb(var(--gm-ink));
    font: inherit;
    font-size: 0.875rem;
    font-weight: 650;
    cursor: pointer;
    text-align: start;
  }
  .go-more-btn:hover:not(:disabled),
  .go-more-btn:focus-visible:not(:disabled) {
    border-color: rgb(var(--gm-accent));
    color: rgb(var(--gm-accent));
    outline: none;
  }
  .go-more-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .go-more-btn--danger {
    background: rgb(var(--gm-danger));
    border-color: rgb(var(--gm-danger));
    color: #fff;
    text-align: center;
  }
  .go-more-btn--danger:hover:not(:disabled),
  .go-more-btn--danger:focus-visible:not(:disabled) {
    filter: brightness(1.05);
    color: #fff;
  }
  .go-more-btn--danger-outline {
    border-color: color-mix(in oklab, rgb(var(--gm-danger)) 55%, rgb(var(--gm-line)));
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
</style>
