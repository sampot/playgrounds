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
    top: 0;
    /* 統一貼齊畫面最左邊。 */
    left: 0;
    /* 零尺寸定位錨；把手與面板各自絕對定位，展開時把手不位移。 */
    width: 0;
    height: 100%;
    pointer-events: none;
  }
  .game-drawer-handle {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    width: 0.75rem;
    height: 3.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--pixel-edge);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font-size: 0.5rem;
    line-height: 1;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    pointer-events: auto;
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
    position: absolute;
    /* 頂部對齊 FAB 頂部（FAB 高 3.25rem、半高 1.625rem），與 FAB 右緣
       實際接觸、連成同一塊，而非只座標貼齊。 */
    top: calc(50% - 1.625rem);
    /* 貼齊 FAB 右緣（FAB 寬 0.75rem＋其右邊框 3px，避免兩邊框重疊）；
       與把手寬度同步。 */
    left: calc(0.75rem + var(--pixel-edge));
    width: 16rem;
    max-width: 78vw;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background:
      linear-gradient(
        180deg,
        color-mix(in oklab, rgb(var(--gold-soft)) 14%, transparent) 0,
        transparent 40%
      ),
      rgb(var(--fill));
    box-shadow: var(--pixel-shadow);
    pointer-events: auto;
  }
  /* 展開時 FAB 與選單連成一體：去掉相接的邊框與圓角，選單貼到 FAB 外緣，
     兩者共享一條連續外框，看起來是同一塊。 */
  .game-drawer--open .game-drawer-handle {
    border-right: none;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    /* 底色／邊框與選單一致，看起來是同一塊；強制邊框為黑（--ink），
       避免手機觸控 lingering :hover 把邊框變成 accent 而與選單不一致。 */
    background: rgb(var(--fill));
    border-color: rgb(var(--ink));
  }
  .game-drawer--open .game-drawer-handle:hover,
  .game-drawer--open .game-drawer-handle:focus-visible {
    border-color: rgb(var(--ink));
    color: rgb(var(--ink));
    outline: none;
  }
  .game-drawer--open .game-drawer-panel {
    top: calc(50% - 1.625rem);
    /* 往右移 3px（FAB 右邊框寬），不與 FAB 外緣重疊。 */
    left: calc(0.75rem + var(--pixel-edge));
    border-left: none;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  .game-drawer-title {
    margin: 0 0 0.25rem;
    font-family: var(--pixel);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgb(var(--muted));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .game-drawer-title::before {
    content: "▸ ";
    color: rgb(var(--gold));
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
  /* 手機：把手縮窄並貼最左邊（視窗邊緣），面板不超過視寬。 */
  @media (max-width: 30rem) {
    .game-drawer-rail {
      left: 0;
    }
    .game-drawer-handle {
      width: 0.67rem;
      height: 3rem;
      font-size: 0.45rem;
      border-radius: var(--pixel-edge) 0 0 var(--pixel-edge);
      border-right: none;
    }
    .game-drawer-panel {
      top: calc(50% - 1.5rem);
      left: calc(0.67rem + var(--pixel-edge));
      width: 14rem;
    }
    .game-drawer--open .game-drawer-panel {
      /* 手機 FAB 高 3rem（半高 1.5rem）：頂部對齊 FAB，並右移 3px。 */
      top: calc(50% - 1.5rem);
      left: calc(0.67rem + var(--pixel-edge));
      border-left: none;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
