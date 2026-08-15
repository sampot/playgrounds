<script lang="ts">
  import { onMount } from "svelte";
  import {
    GO_HOME_DESCRIPTION,
    GO_HOME_DOCUMENT_TITLE,
    GO_HOME_LEAD,
    goOgMeta,
  } from "$lib/goShareMeta";
  import {
    claimBossWelcome,
    pickBossWelcome,
    readRecentBossWelcomes,
    rememberBossWelcome,
  } from "$lib/goBossWelcome";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { recommendHome, searchGoCatalogById, type GoCatalogEntry } from "$lib/goCatalog";
  import GoSeriesIcon from "$lib/GoSeriesIcon.svelte";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  let input = $state("");
  // 穩定推薦池：只在「再次推薦」時重新產生，捲動不改變內容。
  // 初值用區域常數，避免 $state 初始化時互相引用（state_referenced_locally）。
  const initialPool = recommendHome(4);
  const initialRecCount = homeRecCount();
  let pool = $state<GoCatalogEntry[]>(initialPool);
  let recCount = $state(initialRecCount);
  let recs = $state<GoCatalogEntry[]>(initialPool.slice(0, initialRecCount));
  let isSearching = $state(false);
  const og = goOgMeta({
    title: GO_HOME_DOCUMENT_TITLE,
    description: GO_HOME_DESCRIPTION,
    url: `${PLAYGROUNDS_GO_ORIGIN}/`,
  });

  onMount(() => {
    let authChecks = 0;
    let timer: ReturnType<typeof setTimeout>;

    function welcomeWhenAuthSettles() {
      // Provision/login feedback owns the shared flash channel. Wait for auth
      // to settle, then stay quiet if it produced a more important message.
      if (goAuth.busy) {
        if (authChecks < 50) {
          authChecks += 1;
          timer = setTimeout(welcomeWhenAuthSettles, 100);
        } else {
          // Auth feedback keeps priority even if its network request is slow.
          claimBossWelcome(sessionStorage);
        }
        return;
      }

      if (!claimBossWelcome(sessionStorage)) return;
      if (chromeSession.flash) return;

      const welcome = pickBossWelcome({
        recentIndices: readRecentBossWelcomes(localStorage),
      });
      rememberBossWelcome(localStorage, welcome.index);
      chromeSession.setFlash(welcome.text, 3800);
    }

    // Let the root layout start goAuth.initFromLocation() before deciding
    // whether the welcome or login feedback should use the flash channel.
    timer = setTimeout(welcomeWhenAuthSettles, 250);
    return () => clearTimeout(timer);
  });

  // 首頁推薦：單列顯示，數量依螢幕寬度 2/3/4（手機→平板→寬螢幕）。
  function homeRecCount(): number {
    if (typeof window === "undefined" || !window.matchMedia) return 4;
    if (window.matchMedia("(min-width: 48rem)").matches) return 4;
    if (window.matchMedia("(min-width: 30rem)").matches) return 3;
    return 2;
  }

  // 只在跨越斷點時調整「顯示數量」，從穩定池中切片——不重新洗牌。
  function syncCount() {
    const n = homeRecCount();
    if (n === recCount) return;
    recCount = n;
    if (!isSearching) recs = pool.slice(0, recCount);
  }

  function reshuffle() {
    input = "";
    pool = recommendHome(4);
    recCount = homeRecCount();
    recs = pool.slice(0, recCount);
    isSearching = false;
  }

  function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    input = target.value.trim();

    if (input.length === 0) {
      syncCount();
      isSearching = false;
    } else {
      recs = searchGoCatalogById(input, 3);
      isSearching = true;
    }
  }

  // 視窗寬度變化時只調整顯示數量（非搜尋態）；手機網址列收合觸發的
  // resize 不會跨越斷點，因此推薦內容保持不變。
  $effect(() => {
    function update() {
      syncCount();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  });
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

<h1 class="pixel-text">純玩</h1>
<p class="lead">{GO_HOME_LEAD}</p>
<p class="status home-tagline">
  <span class="pixel-tag">多款小品</span>
  <span>選一個遊戲直接玩。造訪過的離線也能再開。</span>
</p>

<section class="home-rec" aria-label="推薦試試">
  <h2 class="home-rec-title">推薦試試</h2>
  
  <div class="search-box">
    <input
      type="text"
      class="search-input pixel-input"
      placeholder="輸入部分遊戲 ID 搜尋（例如：break）"
      value={input}
      oninput={handleSearch}
    />
  </div>
  
  {#if recs.length}
    <ul class="home-grid">
      {#each recs as entry (entry.id)}
        <li>
          <a class="home-grid-card" href={`/s/${encodeURIComponent(entry.id)}`}>
            <span class="home-grid-cover" aria-hidden="true">
              <span class="home-grid-cover-icon">
                <GoSeriesIcon series={entry.series} size={34} />
              </span>
            </span>
            <span class="home-grid-name">{entry.title}</span>
            {#if entry.blurb}
              <span class="home-grid-blurb">{entry.blurb}</span>
            {/if}
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

<button type="button" class="home-reshuffle pixel-btn pixel-btn--primary" onclick={reshuffle}>
  再次推薦
</button>

<style>
  .home-tagline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.65rem;
    margin: 0 0 1.1rem;
  }
  .home-rec {
    margin: 0 0 1rem;
  }
  .home-reshuffle {
    display: block;
    width: fit-content;
    margin: 0 auto;
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
  .search-no-results,
  .search-placeholder-text {
    font-size: 0.9rem;
    color: rgb(var(--muted));
    text-align: center;
    padding: 1rem;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    background: rgb(var(--card));
    box-shadow: var(--pixel-shadow);
  }
</style>
