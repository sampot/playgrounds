<script lang="ts">
  import {
    GO_HOME_DESCRIPTION,
    GO_HOME_DOCUMENT_TITLE,
  } from "$lib/goShareMeta";
  import { recommendHome, type GoCatalogEntry } from "$lib/goCatalog";
  import { openPlaygroundHome, PLAY_ORIGIN } from "$lib/openPlayground";
  import { PLAYGROUNDS_GO_ORIGIN } from "@utils/playgroundsUrls";

  const recs: GoCatalogEntry[] = recommendHome(3);
  const canonical = `${PLAYGROUNDS_GO_ORIGIN}/`;
</script>

<svelte:head>
  <title>{GO_HOME_DOCUMENT_TITLE}</title>
  <meta name="description" content={GO_HOME_DESCRIPTION} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content="山姆鍋遊樂場" />
  <meta property="og:title" content={GO_HOME_DOCUMENT_TITLE} />
  <meta property="og:description" content={GO_HOME_DESCRIPTION} />
  <meta property="og:url" content={canonical} />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={GO_HOME_DOCUMENT_TITLE} />
  <meta name="twitter:description" content={GO_HOME_DESCRIPTION} />
</svelte:head>

<h1>純玩</h1>
<p class="lead">選一個遊戲直接玩。造訪過的離線也能再開。</p>

{#if recs.length}
  <section class="home-rec" aria-label="推薦試試">
    <h2 class="home-rec-title">推薦試試</h2>
    <ul class="home-rec-list">
      {#each recs as entry (entry.id)}
        <li>
          <a class="home-rec-card" href={`/s/${encodeURIComponent(entry.id)}`}>
            <span class="home-rec-name">{entry.title}</span>
            {#if entry.blurb}
              <span class="home-rec-blurb">{entry.blurb}</span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<p class="status">
  完整山姆鍋遊樂場在
  <a
    href={`${PLAY_ORIGIN}/`}
    target="_blank"
    rel="noopener noreferrer"
    onclick={openPlaygroundHome}>{PLAY_ORIGIN}</a
  >
</p>

<style>
  .home-rec {
    margin: 0 0 1.25rem;
  }
  .home-rec-title {
    margin: 0 0 0.65rem;
    font-size: 0.95rem;
    font-weight: 700;
  }
  .home-rec-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .home-rec-card {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-height: 2.75rem;
    padding: 0.75rem 0.9rem;
    border: 1px solid rgb(var(--line));
    border-radius: var(--radius);
    background: rgb(var(--card));
    color: rgb(var(--ink));
    text-decoration: none;
    -webkit-tap-highlight-color: color-mix(
      in oklab,
      rgb(var(--accent)) 18%,
      transparent
    );
  }
  .home-rec-card:hover,
  .home-rec-card:focus-visible {
    border-color: rgb(var(--accent));
    outline: none;
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
