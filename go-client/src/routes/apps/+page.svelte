<script lang="ts">
  import { getGoCatalogEntry } from "$lib/goCatalog";
  import GoSeriesIcon from "$lib/GoSeriesIcon.svelte";
  import {
    clearAllGoProgress,
    clearGoProgressForCatalog,
  } from "$lib/goScoreStorage";
  import {
    clearAllGoSamOfflineCache,
    deleteGoSamOfflineCache,
    listGoSamOfflineCatalogIds,
  } from "$lib/goSamOfflineCache";
  import { goto } from "$app/navigation";
  import { chromeSession } from "$lib/chromeSession.svelte";

  type ConfirmKind = "scores" | "offline" | "all";

  let busy = $state(false);
  let confirm = $state<{
    kind: ConfirmKind;
    id: string | null;
    title: string;
  } | null>(null);
  let flash = $state("");

  let apps = $state<{ id: string; title: string; series?: string }[]>([]);

  async function refresh() {
    const ids: string[] = await listGoSamOfflineCatalogIds();
    apps = ids
      .map((id: string) => {
        const e = getGoCatalogEntry(id);
        return { id, title: e?.title ?? id, series: e?.series ?? undefined };
      })
      .filter((a: { id: string; title: string; series?: string }) => a.title.trim().length > 0);
    if (apps.length === 0) {
      apps = ids.map((id: string) => ({ id, title: id, series: undefined }));
    }
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
    if (!confirm || busy) return;
    busy = true;
    const c = confirm;
    try {
      if (c.kind === "scores" && c.id) {
        const n = await clearGoProgressForCatalog(c.id);
        flash = n > 0
          ? `已清除「${c.title}」的進度／分數`
          : `「${c.title}」沒有可清除的進度／分數`;
      } else if (c.kind === "offline" && c.id) {
        const ok = await deleteGoSamOfflineCache(c.id);
        flash = ok
          ? `已移除「${c.title}」的離線下載`
          : `找不到「${c.title}」的離線下載`;
        await refresh();
      } else if (c.kind === "all") {
        const scores = await clearAllGoProgress();
        const packs = await clearAllGoSamOfflineCache();
        flash = `已清除全部本機遊戲資料（分數 ${scores} 筆、離線包 ${packs} 個）`;
        confirm = null;
        await refresh();
        return;
      }
      confirm = null;
    } finally {
      busy = false;
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

  $effect(() => {
    if (!chromeSession.flash) return;
    flash = chromeSession.flash;
    const t = setTimeout(() => {
      if (chromeSession.flash === flash) chromeSession.setFlash("");
    }, 2200);
    return () => clearTimeout(t);
  });

  $effect(() => {
    void refresh();
  });
</script>

<svelte:head>
  <title>已安裝遊戲</title>
  <meta name="description" content="管理已安裝的遊戲與小品" />
</svelte:head>

<p class="back">
  <a href="/">← 回純玩首頁</a>
</p>

<h1>已安裝遊戲</h1>

{#if flash}
  <p class="flash" role="status">{flash}</p>
{/if}

{#if confirm}
  <div class="confirm" role="alertdialog" aria-labelledby="apps-confirm-title">
    <h2 id="apps-confirm-title" class="confirm-title">{confirmCopy.title}</h2>
    <p class="confirm-body">{confirmCopy.body}</p>
    <div class="confirm-actions">
      <button
        type="button"
        class="btn"
        disabled={busy}
        onclick={() => (confirm = null)}
      >
        取消
      </button>
      <button
        type="button"
        class="btn btn-danger"
        disabled={busy}
        onclick={() => void runConfirm()}
      >
        {confirmCopy.ok}
      </button>
    </div>
  </div>
{/if}

{#if apps.length === 0}
  <div class="empty-pixel">
    <svg width="72" height="72" viewBox="0 0 12 12" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">
      <rect x="2" y="4" width="8" height="5" />
      <rect x="3" y="3" width="6" height="1" />
      <rect x="3" y="9" width="6" height="1" />
      <rect x="4" y="6" width="1" height="1" fill="rgb(var(--fill))" />
      <rect x="7" y="6" width="1" height="1" fill="rgb(var(--fill))" />
      <rect x="5" y="7" width="2" height="1" fill="rgb(var(--fill))" />
    </svg>
    <p>還沒有安裝任何遊戲。連線玩過一次後就會出現在這裡。</p>
  </div>
{:else}
  <ul class="app-list">
    {#each apps as app (app.id)}
       <li class="app-row">
          <span class="app-icon" aria-hidden="true">
            <GoSeriesIcon series={app.series} size={20} />
          </span>
         <a
           class="app-name"
           href={`/s/${encodeURIComponent(app.id)}`}
         >
           {app.title}
         </a>
        <div class="app-acts">
          <button
            type="button"
            class="act-btn"
            title={`清除「${app.title}」進度／分數`}
            aria-label={`清除「${app.title}」進度／分數`}
            onclick={() => askClearScores(app.id, app.title)}
          >
            清分
          </button>
          <button
            type="button"
            class="act-btn act-btn--danger"
            title={`移除「${app.title}」離線下載`}
            aria-label={`移除「${app.title}」離線下載`}
            onclick={() => askRemoveOffline(app.id, app.title)}
          >
            卸包
          </button>
        </div>
      </li>
    {/each}
  </ul>

  <section class="apps-advanced">
    <button
      type="button"
      class="btn btn-danger-outline"
      onclick={askClearAll}
    >
      清除全部本機遊戲資料…
    </button>
  </section>
{/if}

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
  h1 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 700;
  }
  .flash {
    margin: 0 0 0.75rem;
    font-size: 0.875rem;
    line-height: 1.4;
    color: rgb(var(--muted));
  }
  .empty-pixel p {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: rgb(var(--muted));
  }
  .confirm {
    margin: 0 0 1rem;
    padding: 1rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    box-shadow: var(--pixel-shadow);
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
  .app-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .app-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    box-shadow: var(--pixel-shadow);
    min-width: 0;
  }
  .app-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgb(var(--accent));
    font-size: 1.3rem;
    line-height: 1;
  }
  .app-name {
    flex: 1;
    min-width: 0;
    font-weight: 650;
    font-size: 0.9rem;
    color: rgb(var(--ink));
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .app-name:hover,
  .app-name:focus-visible {
    color: rgb(var(--accent));
    outline: none;
  }
  .app-acts {
    flex-shrink: 0;
    display: flex;
    gap: 0.35rem;
  }
  .act-btn {
    min-height: 2.5rem;
    min-width: 2.5rem;
    padding: 0.35rem 0.55rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2);
  }
  .act-btn:hover:not(:disabled),
  .act-btn:focus-visible:not(:disabled) {
    border-color: rgb(var(--accent));
    color: rgb(var(--accent));
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .act-btn:active:not(:disabled) {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--ink));
  }
  .act-btn--danger {
    color: rgb(var(--danger));
    border-color: rgb(var(--danger));
  }
  .act-btn--danger:hover:not(:disabled),
  .act-btn--danger:focus-visible:not(:disabled) {
    color: rgb(var(--danger));
    border-color: rgb(var(--danger));
  }
  .apps-advanced {
    margin-top: 1.25rem;
  }
  .btn {
    min-height: 2.75rem;
    min-width: 2.75rem;
    padding: 0.55rem 1rem;
    border-radius: var(--radius);
    border: var(--pixel-edge) solid rgb(var(--ink));
    background: rgb(var(--card));
    color: rgb(var(--ink));
    font-family: var(--pixel);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
  }
  .btn-danger {
    background: rgb(var(--danger));
    border-color: rgb(var(--ink));
    color: #fff;
    text-align: center;
  }
  .btn-danger:hover:not(:disabled),
  .btn-danger:focus-visible:not(:disabled) {
    filter: brightness(1.08);
    color: #fff;
  }
  .btn-danger-outline {
    border-color: rgb(var(--danger));
    color: rgb(var(--danger));
  }
</style>
