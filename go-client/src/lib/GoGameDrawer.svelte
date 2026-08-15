<script lang="ts">
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import { runClearScores, runRemoveOffline, runUpdate } from "$lib/goGameActions";

  type Props = {
    /** Solo `/s/` current id — only shown when present. */
    catalogId: string | null;
    open?: boolean;
    onFlash: (msg: string) => void;
    onRemovedOffline?: (flash: string) => void;
  };

  let { catalogId, open = $bindable(false), onFlash, onRemovedOffline }: Props =
    $props();

  let busy = $state(false);
  let confirm = $state<{
    kind: "scores" | "offline";
    title: string;
  } | null>(null);

  const entry = $derived(
    catalogId ? (getGoCatalogEntry(catalogId) ?? null) : null
  );
  const title = $derived(entry?.title ?? catalogId ?? "");

  function toggle() {
    open = !open;
    if (!open) confirm = null;
  }

  function askScores() {
    if (catalogId) confirm = { kind: "scores", title };
  }
  function askOffline() {
    if (catalogId) confirm = { kind: "offline", title };
  }

  async function doScores() {
    if (!catalogId || busy) return;
    busy = true;
    try {
      const r = await runClearScores(catalogId, title);
      onFlash(r.flash);
      confirm = null;
      open = false;
    } finally {
      busy = false;
    }
  }

  async function doOffline() {
    if (!catalogId || busy) return;
    busy = true;
    try {
      const r = await runRemoveOffline(catalogId, title);
      confirm = null;
      open = false;
      if (onRemovedOffline) onRemovedOffline(r.flash);
      else onFlash(r.flash);
    } finally {
      busy = false;
    }
  }

  async function doUpdate() {
    if (!entry || busy) return;
    busy = true;
    try {
      const r = await runUpdate(entry);
      onFlash(r.flash);
    } finally {
      busy = false;
    }
  }

  const confirmCopy = $derived.by(() => {
    if (!confirm) return { title: "", body: "" };
    if (confirm.kind === "scores") {
      return {
        title: "清除進度／分數",
        body: `清除「${confirm.title}」在本機的進度與分數？無法復原。`,
      };
    }
    return {
      title: "移除離線下載",
      body: `移除「${confirm.title}」的離線包？下次離線前需再連線載入一次。`,
    };
  });
</script>

<div class="game-drawer" class:game-drawer--open={open}>
  {#if open}
    <div
      class="game-drawer-scrim"
      role="button"
      tabindex="-1"
      aria-label="關閉遊戲操作"
      onclick={() => {
        open = false;
        confirm = null;
      }}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          open = false;
          confirm = null;
        }
      }}
    ></div>
  {/if}

  <div class="game-drawer-rail" aria-hidden={open ? undefined : "true"}>
    <button
      type="button"
      class="game-drawer-handle"
      aria-expanded={open}
      aria-label={open ? "收合遊戲操作" : "展開遊戲操作"}
      onclick={toggle}
    >
      <span class="game-drawer-handle-glyph" aria-hidden="true">☰</span>
    </button>

    {#if open}
      <div
        class="game-drawer-panel"
        role="menu"
        aria-label="這個遊戲的操作"
      >
        <p class="game-drawer-title">{title}</p>

        {#if confirm}
          <div class="game-drawer-confirm" role="alertdialog">
            <p class="game-drawer-confirm-title">{confirmCopy.title}</p>
            <p class="game-drawer-confirm-body">{confirmCopy.body}</p>
            <div class="game-drawer-confirm-actions">
              <button
                type="button"
                class="game-drawer-btn"
                disabled={busy}
                onclick={() => (confirm = null)}
              >
                取消
              </button>
              <button
                type="button"
                class="game-drawer-btn game-drawer-btn--danger"
                disabled={busy}
                onclick={() => {
                  if (!confirm) return;
                  if (confirm.kind === "scores") void doScores();
                  else void doOffline();
                }}
              >
                {confirm.kind === "scores" ? "清除進度" : "移除下載"}
              </button>
            </div>
          </div>
        {:else}
          <button
            type="button"
            class="game-drawer-btn"
            disabled={busy}
            onclick={askScores}
          >
            清除進度
          </button>
          <button
            type="button"
            class="game-drawer-btn"
            disabled={busy}
            onclick={askOffline}
          >
            移除離線
          </button>
          <button
            type="button"
            class="game-drawer-btn"
            disabled={busy}
            onclick={() => void doUpdate()}
          >
            檢查更新
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .game-drawer {
    position: absolute;
    inset: 0;
    z-index: 24;
    pointer-events: none;
  }
  .game-drawer-scrim {
    position: absolute;
    inset: 0;
    background: color-mix(in oklab, rgb(var(--ink)) 35%, transparent);
    pointer-events: auto;
  }
  .game-drawer-rail {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    pointer-events: auto;
  }
  .game-drawer-handle {
    width: 2.75rem;
    height: 2.75rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-left: none;
    border-radius: 0 var(--radius) var(--radius) 0;
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 1.1rem;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
  }
  .game-drawer-handle:hover,
  .game-drawer-handle:focus-visible {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .game-drawer-panel {
    width: 16rem;
    max-width: 78vw;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    box-shadow: var(--pixel-shadow);
  }
  .game-drawer-title {
    margin: 0 0 0.25rem;
    font-family: var(--pixel);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: rgb(var(--muted));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .game-drawer-btn {
    min-height: 2.75rem;
    width: 100%;
    padding: 0.45rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
    box-sizing: border-box;
    box-shadow: 0 3px 0 0 rgb(var(--ink));
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2),
      border-color 0.12s steps(2);
  }
  .game-drawer-btn:hover:not(:disabled),
  .game-drawer-btn:focus-visible:not(:disabled) {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
  }
  .game-drawer-btn:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--ink));
  }
  .game-drawer-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .game-drawer-btn--danger {
    background: rgb(var(--danger));
    border-color: rgb(var(--ink));
    color: #fff;
  }
  .game-drawer-btn--danger:hover:not(:disabled),
  .game-drawer-btn--danger:focus-visible:not(:disabled) {
    filter: brightness(1.08);
    color: #fff;
  }
  .game-drawer-confirm {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .game-drawer-confirm-title {
    margin: 0;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .game-drawer-confirm-body {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: rgb(var(--muted));
  }
  .game-drawer-confirm-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .game-drawer-confirm-actions .game-drawer-btn {
    text-align: center;
  }
  /* 手機：把手放大、面板不超過視寬，維持可觸達。 */
  @media (max-width: 30rem) {
    .game-drawer-handle {
      width: 3rem;
      height: 3rem;
    }
    .game-drawer-panel {
      width: 14rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
