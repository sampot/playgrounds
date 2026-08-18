<script lang="ts">
  import { recommendHome, searchGoCatalog, type GoCatalogEntry } from "$lib/goCatalog";
  import GoEntryCover from "$lib/GoEntryCover.svelte";

  let {
    open = $bindable(false),
  }: {
    open?: boolean;
  } = $props();

  let input = $state("");
  let pool = $state<GoCatalogEntry[]>([]);
  let recs = $state<GoCatalogEntry[]>([]);
  let recsReady = $state(false);
  let isSearching = $state(false);
  let searchEl = $state<HTMLInputElement | null>(null);
  let wasOpen = false;

  function applyFreshPool() {
    input = "";
    pool = recommendHome(4);
    recs = pool;
    isSearching = false;
    recsReady = true;
  }

  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    input = target.value.trim();
    if (input.length === 0) {
      recs = pool;
      isSearching = false;
      return;
    }
    recs = searchGoCatalog(input, 3);
    isSearching = true;
  }

  function reshuffle() {
    applyFreshPool();
    searchEl?.focus();
  }

  function close() {
    open = false;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  $effect(() => {
    if (!open) {
      wasOpen = false;
      return;
    }
    if (!wasOpen) {
      applyFreshPool();
      wasOpen = true;
    }
    searchEl?.focus();
  });
</script>

{#if open}
  <div
    class="cabinet-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="cabinet-overlay-title"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <div class="cabinet-panel pixel-box">
      <header class="cabinet-header">
        <h2 id="cabinet-overlay-title" class="cabinet-title pixel-text">機台區</h2>
        <button type="button" class="pixel-btn cabinet-close" onclick={close}>
          關閉
        </button>
      </header>
      <p class="cabinet-lead">選一個遊戲直接玩。造訪過的離線也能再開。</p>
      <div class="cabinet-search">
        <input
          bind:this={searchEl}
          type="search"
          class="search-input pixel-input"
          placeholder="搜尋遊戲名稱或 id"
          value={input}
          oninput={handleSearch}
        />
      </div>
      <div class="cabinet-body">
        {#if recs.length}
          <ul class="cabinet-grid">
            {#each recs as entry (entry.id)}
              <li>
                <a class="cabinet-card" href={`/s/${encodeURIComponent(entry.id)}`}>
                  <span class="cabinet-cover" aria-hidden="true">
                    {#key `${entry.id}:${entry.cover ?? ""}`}
                      <GoEntryCover
                        cover={entry.cover}
                        series={entry.series}
                        variant="fill"
                        size={28}
                      />
                    {/key}
                  </span>
                  <span class="cabinet-name">{entry.title}</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else if isSearching}
          <p class="cabinet-empty">沒有找到符合的遊戲</p>
        {:else if !recsReady}
          <p class="cabinet-empty">正在挑選推薦…</p>
        {:else}
          <p class="cabinet-empty">搜尋遊戲名稱或 id，或點「再次推薦」</p>
        {/if}
      </div>
      <div class="cabinet-actions">
        <button type="button" class="pixel-btn pixel-btn--primary cabinet-reshuffle" onclick={reshuffle}>
          再次推薦
        </button>
        <a class="cabinet-link" href="/apps">已下載</a>
        <a class="cabinet-link" href="/help">說明</a>
      </div>
    </div>
  </div>
{/if}

<style>
  .cabinet-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 3;
    min-height: 100%;
    max-height: min(70dvh, 32rem);
    display: flex;
    flex-direction: column;
    padding: 0.35rem;
    background: color-mix(in oklab, rgb(var(--ink)) 28%, transparent);
    border-radius: var(--radius);
  }
  .cabinet-panel {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 0.55rem 0.65rem 0.65rem;
    background: rgb(var(--card));
    overflow: hidden;
  }
  .cabinet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    margin-bottom: 0.25rem;
  }
  .cabinet-title {
    margin: 0;
    font-family: var(--pixel);
    font-size: 0.9rem;
    font-weight: 700;
  }
  .cabinet-close {
    min-height: 44px;
    min-width: 44px;
    flex: 0 0 auto;
  }
  .cabinet-lead {
    margin: 0 0 0.45rem;
    font-size: 0.78rem;
    line-height: 1.35;
    color: color-mix(in oklab, rgb(var(--ink)) 78%, transparent);
  }
  .cabinet-search {
    margin-bottom: 0.45rem;
  }
  .cabinet-search :global(.search-input) {
    width: 100%;
    min-height: 44px;
  }
  .cabinet-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
  }
  .cabinet-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .cabinet-card {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-height: 44px;
    padding: 0.35rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    text-decoration: none;
  }
  .cabinet-card:focus-visible {
    border-color: rgb(var(--accent));
    outline: none;
  }
  .cabinet-cover {
    position: relative;
    display: block;
    aspect-ratio: 4 / 3;
    max-height: 4.2rem;
    overflow: hidden;
    border: 2px solid rgb(var(--ink));
    border-radius: var(--radius);
  }
  .cabinet-name {
    font-weight: 700;
    font-size: 0.78rem;
    line-height: 1.25;
  }
  .cabinet-empty {
    margin: 0;
    font-size: 0.85rem;
    color: rgb(var(--muted));
    text-align: center;
    padding: 0.7rem 0.4rem;
  }
  .cabinet-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
    margin-top: 0.5rem;
  }
  .cabinet-reshuffle {
    min-height: 44px;
    flex: 1 1 8rem;
  }
  .cabinet-link {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    font-size: 0.82rem;
    font-weight: 600;
    text-decoration: none;
    color: color-mix(in oklab, rgb(var(--ink)) 78%, transparent);
  }
  .cabinet-link:focus-visible,
  .cabinet-link:hover {
    color: rgb(var(--accent));
    text-decoration: underline;
    outline: none;
  }
  @media (min-width: 30rem) {
    .cabinet-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .cabinet-cover {
      max-height: 5.5rem;
    }
  }
</style>
