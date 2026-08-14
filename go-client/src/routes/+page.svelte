<script lang="ts">
  import {
    GO_HOME_DESCRIPTION,
    GO_HOME_DOCUMENT_TITLE,
    GO_HOME_LEAD,
    goOgMeta,
  } from "$lib/goShareMeta";
  import { recommendHome, searchGoCatalogById, seriesIcon, type GoCatalogEntry } from "$lib/goCatalog";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  let input = $state("");
  let recs = $state<GoCatalogEntry[]>(recommendHome(3));
  let isSearching = $state(false);
  const og = goOgMeta({
    title: GO_HOME_DOCUMENT_TITLE,
    description: GO_HOME_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/`,
  });

  function reshuffle() {
    input = "";
    recs = recommendHome(3);
    isSearching = false;
  }

  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    input = target.value.trim();
    
    if (input.length === 0) {
      recs = recommendHome(3);
      isSearching = false;
    } else {
      recs = searchGoCatalogById(input, 3);
      isSearching = true;
    }
  }
</script>

<svelte:head>
  <title>{og.title}</title>
  <meta name="description" content={og.description} />
  <link rel="canonical" href={og.url} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content={og.siteName} />
  <meta property="og:title" content={og.title} />
  <meta property="og:description" content={og.description} />
  <meta property="og:url" content={og.url} />
  <meta property="og:image" content={og.image} />
  <meta property="og:image:width" content={String(og.imageWidth)} />
  <meta property="og:image:height" content={String(og.imageHeight)} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={og.title} />
  <meta name="twitter:description" content={og.description} />
  <meta name="twitter:image" content={og.image} />
</svelte:head>

<h1>純玩</h1>
<p class="lead">{GO_HOME_LEAD}</p>
<p class="status">選一個遊戲直接玩。造訪過的離線也能再開。</p>

<section class="home-rec" aria-label="推薦試試">
  <h2 class="home-rec-title">推薦試試</h2>
  
  <div class="search-box">
    <input
      type="text"
      class="search-input"
      placeholder="輸入部分遊戲 ID 搜尋（例如：break）"
      value={input}
      oninput={handleSearch}
    />
  </div>
  
  {#if recs.length}
    <ul class="home-rec-list">
      {#each recs as entry (entry.id)}
        <li>
          <a class="home-rec-card" href={`/s/${encodeURIComponent(entry.id)}`}>
            <span class="home-rec-icon" aria-hidden="true">{seriesIcon(entry.series)}</span>
            <span class="home-rec-text">
              <span class="home-rec-name">{entry.title}</span>
              {#if entry.blurb}
                <span class="home-rec-blurb">{entry.blurb}</span>
              {/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {:else if isSearching}
    <p class="search-no-results">沒有找到符合的遊戲</p>
  {:else}
    <p class="search-placeholder-text">輸入部分遊戲 ID 搜尋，或點擊「再次推薦」隨機選取</p>
  {/if}
</section>

<button type="button" class="home-reshuffle" onclick={reshuffle}>
  再次推薦
</button>

<style>
  .home-rec {
    margin: 0 0 1rem;
  }
  .home-reshuffle {
    min-height: 2.75rem;
    padding: 0.55rem 1rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--accent));
    color: #fff;
    font-family: var(--pixel);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: var(--pixel-shadow);
    transition:
      transform 0.06s steps(2),
      box-shadow 0.06s steps(2);
  }
  html[data-theme="dark"] .home-reshuffle {
    color: #042f2e;
  }
  .home-reshuffle:hover,
  .home-reshuffle:focus-visible {
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .home-reshuffle:active {
    transform: translateY(3px);
    box-shadow: 0 0 0 0 rgb(var(--ink));
  }
  .home-rec-title {
    margin: 0 0 0.65rem;
    font-family: var(--pixel);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .search-box {
    margin-bottom: 0.65rem;
  }
  .search-input {
    width: 100%;
    padding: 0.65rem 0.9rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--fill));
    color: rgb(var(--ink));
    font: inherit;
    font-size: 0.95rem;
    box-sizing: border-box;
    box-shadow: inset 0 2px 0 0 color-mix(in oklab, rgb(var(--ink)) 10%, transparent);
  }
  .search-input:hover,
  .search-input:focus-visible {
    border-color: rgb(var(--accent));
    outline: none;
  }
  .search-input::placeholder {
    color: rgb(var(--muted));
  }
  .home-rec-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .search-no-results,
  .search-placeholder-text {
    font-size: 0.9rem;
    color: rgb(var(--muted));
    text-align: center;
    padding: 1rem;
  }
  .home-rec-card {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-height: 2.75rem;
    padding: 0.75rem 0.9rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    text-decoration: none;
    box-shadow: var(--pixel-shadow);
    animation: pixel-pop 0.22s steps(3) both;
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 24%,
      transparent
    );
  }
  .home-rec-card:hover,
  .home-rec-card:focus-visible {
    border-color: rgb(var(--accent));
    outline: none;
    animation: pixel-blink 0.9s steps(2) infinite;
  }
  .home-rec-icon {
    flex-shrink: 0;
    font-size: 1.4rem;
    line-height: 1;
  }
  .home-rec-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }
  .home-rec-name {
    font-weight: 650;
    font-size: 0.95rem;
  }
  .home-rec-blurb {
    font-size: 0.8rem;
    color: rgb(var(--muted));
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
