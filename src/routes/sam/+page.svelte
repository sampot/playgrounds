<script lang="ts">
  import { onMount } from "svelte";
  import SamCatalogIcon from "@components/SamCatalogIcon.svelte";
  import {
    SAM_KIND_LABEL,
    samCatalog,
    samCatalogByKind,
    samCatalogPage,
    samOpenHref,
    samSourceHref,
    type SamKind,
  } from "../../data/samCatalog";

  const title = samCatalogPage.title;
  const description = samCatalogPage.description;
  const pageTitle = `${title} · 我是山姆鍋`;
  const site = "https://play.samkuo.me";
  const canonicalUrl = `${site}/sam/`;
  const ogImageUrl = `${site}/sam/og.png`;

  const kindBlocks = samCatalogByKind();
  const countByKind = Object.fromEntries(
    kindBlocks.map(b => [
      b.kind,
      samCatalog.filter(e => e.kind === b.kind).length,
    ])
  ) as Partial<Record<SamKind, number>>;
  const gameCount = countByKind.game ?? 0;
  const toolCount = countByKind.tool ?? 0;
  const agentCount = countByKind.agent ?? 0;
  const toyCount = countByKind.toy ?? 0;
  const mediaCount = countByKind.media ?? 0;

  function countFor(kind: SamKind) {
    return countByKind[kind] ?? 0;
  }

  let selectedKind = $state(kindBlocks[0]?.kind ?? "tool");

  function selectKind(kind: string | undefined, { pushHash = true } = {}) {
    if (!kind || !kindBlocks.some(b => b.kind === kind)) {
      kind = kindBlocks[0]?.kind;
    }
    if (!kind) return;
    selectedKind = kind as SamKind;
    if (pushHash) {
      const next = `#${kind}`;
      if (location.hash !== next) {
        history.replaceState(null, "", next);
      }
    }
  }

  function parseSeriesHash(raw: string): { kind: string; id: string } | null {
    const m = /^series-(tool|agent|game|toy|media)-(.+)$/.exec(raw);
    if (!m?.[1] || !m[2]) return null;
    if (!kindBlocks.some(b => b.kind === m[1])) return null;
    return { kind: m[1], id: `series-${m[1]}-${m[2]}` };
  }

  function applyHash({ scroll = true } = {}) {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    const series = parseSeriesHash(raw);
    if (series) {
      selectKind(series.kind, { pushHash: false });
      if (scroll) {
        requestAnimationFrame(() => {
          document.getElementById(series.id)?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }
      return;
    }
    selectKind(
      kindBlocks.some(b => b.kind === raw) ? raw : kindBlocks[0]?.kind,
      { pushHash: false }
    );
  }

  function onTabKeydown(ev: KeyboardEvent, index: number) {
    let next = -1;
    if (ev.key === "ArrowRight" || ev.key === "ArrowDown")
      next = (index + 1) % kindBlocks.length;
    if (ev.key === "ArrowLeft" || ev.key === "ArrowUp")
      next = (index - 1 + kindBlocks.length) % kindBlocks.length;
    if (ev.key === "Home") next = 0;
    if (ev.key === "End") next = kindBlocks.length - 1;
    if (next < 0) return;
    ev.preventDefault();
    selectKind(kindBlocks[next]?.kind);
    const tab = document.getElementById(`tab-${kindBlocks[next]?.kind}`);
    tab?.focus();
  }

  onMount(() => {
    applyHash({ scroll: true });
    const onHash = () => applyHash({ scroll: true });
    window.addEventListener("hashchange", onHash);

    const catalog = document.querySelector(".sam-catalog");
    if (!(catalog instanceof HTMLElement) || catalog.dataset.ctaReady === "1") {
      return () => window.removeEventListener("hashchange", onHash);
    }
    catalog.dataset.ctaReady = "1";

    const clearOpen = (except?: Element | null) => {
      for (const tile of catalog.querySelectorAll(".catalog-tile.is-cta-open")) {
        if (tile !== except) tile.classList.remove("is-cta-open");
      }
    };

    const onPointerUp = (ev: Event) => {
      const target = ev.target as Element | null;
      const tile = target?.closest?.(".catalog-tile");
      if (!(tile instanceof HTMLElement) || !catalog.contains(tile)) return;
      if (target?.closest?.(".btn-open, .catalog-repo")) return;
      clearOpen(tile);
      tile.classList.add("is-cta-open");
    };

    const onPointerDown = (ev: Event) => {
      const target = ev.target as Element | null;
      if (target?.closest?.(".catalog-tile")) return;
      clearOpen();
    };

    catalog.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.removeEventListener("hashchange", onHash);
      catalog.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
  <meta name="description" content={description} />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="zh_TW" />
  <meta property="og:site_name" content="我是山姆鍋" />
  <meta property="og:title" content={pageTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={pageTitle} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={ogImageUrl} />
</svelte:head>

<div class="sam-catalog">
  <header class="catalog-hero">
    <h1>{title}</h1>
    <p class="lede">{@html samCatalogPage.lede}</p>
    <p class="meta">
      共 {samCatalog.length} 款（工具 {toolCount} · 代理 {agentCount} · 遊戲{" "}
      {gameCount} · 玩具 {toyCount} · 影音繪圖 {mediaCount}）
    </p>
  </header>

  <div class="kind-tabs" data-sam-kind-tabs>
    <div class="tablist" role="tablist" aria-label="小品類型">
      {#each kindBlocks as { kind, label }, index}
        <button
          type="button"
          class="tab"
          role="tab"
          id="tab-{kind}"
          aria-controls="panel-{kind}"
          aria-selected={selectedKind === kind ? "true" : "false"}
          tabindex={selectedKind === kind ? 0 : -1}
          data-kind={kind}
          onclick={() => selectKind(kind)}
          onkeydown={ev => onTabKeydown(ev, index)}
        >
          {label}
          <span class="tab-count">{countFor(kind)}</span>
        </button>
      {/each}
    </div>

    {#each kindBlocks as { kind, seriesBlocks }}
      <div
        class="tab-panel"
        role="tabpanel"
        id="panel-{kind}"
        aria-labelledby="tab-{kind}"
        data-kind={kind}
        hidden={selectedKind !== kind}
      >
        {#if seriesBlocks.length > 1}
          <nav class="series-jump" aria-label="{SAM_KIND_LABEL[kind]}系列">
            <span class="series-jump-label">系列</span>
            <ul class="series-jump-list">
              {#each seriesBlocks as { series, entries }}
                <li>
                  <a
                    class="series-jump-link"
                    href="#series-{kind}-{series}"
                    data-series-jump
                    data-kind={kind}
                    onclick={() => selectKind(kind, { pushHash: false })}
                  >
                    {series}
                    <span class="series-jump-count">{entries.length}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </nav>
        {/if}
        {#each seriesBlocks as { series, entries }}
          <section
            class="series"
            aria-labelledby="series-{kind}-{series}"
          >
            <div class="series-head">
              <h2 id="series-{kind}-{series}">{series}</h2>
              <span class="series-count">{entries.length}</span>
            </div>
            <ul class="catalog-grid">
              {#each entries as entry}
                <li class="catalog-tile">
                  <div class="tile-body">
                    <div class="tile-head">
                      <SamCatalogIcon repo={entry.repo} title={entry.title} />
                      <h3 class="catalog-title">{entry.title}</h3>
                    </div>
                    <p class="catalog-blurb">{entry.blurb}</p>
                  </div>
                  <div class="tile-foot">
                    <a
                      class="catalog-repo"
                      href={samSourceHref(entry.source)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {entry.id}
                    </a>
                    <a class="btn-open" href={samOpenHref(entry)}>一鍵開</a>
                  </div>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    {/each}
  </div>

  <p class="footnote">{@html samCatalogPage.footnote}</p>
</div>

<style>
  .sam-catalog {
    margin-inline: auto;
    width: 100%;
    max-width: 64rem;
    padding: 1.25rem 1rem 7rem;
  }

  .catalog-hero {
    margin-bottom: 2rem;
    max-width: 42rem;
  }

  .catalog-hero h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  @media (min-width: 640px) {
    .catalog-hero h1 {
      font-size: 1.875rem;
    }
  }

  .lede {
    margin-top: 0.75rem;
    font-size: 1rem;
    line-height: 1.625;
    color: rgb(var(--color-text-base) / 0.9);
  }

  .lede :global(a),
  .footnote :global(a) {
    color: rgb(var(--color-accent));
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 4px;
  }

  .lede :global(strong),
  .footnote :global(strong) {
    font-weight: 600;
    color: rgb(var(--color-text-base));
  }

  .meta {
    margin-top: 0.5rem;
    font-size: 0.875rem;
    color: rgb(var(--color-text-base) / 0.55);
  }

  .kind-tabs {
    margin-bottom: 2.5rem;
  }

  .tablist {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0 0 1.5rem;
    padding: 0.25rem;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.65rem;
    background: rgb(var(--color-card) / 0.35);
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    border: 0;
    border-radius: 0.45rem;
    background: transparent;
    color: rgb(var(--color-text-base) / 0.72);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 0.55rem 0.95rem;
    cursor: pointer;
  }

  .tab:hover {
    color: rgb(var(--color-text-base));
    background: rgb(var(--color-card) / 0.55);
  }

  .tab[aria-selected="true"] {
    color: rgb(var(--color-fill));
    background: rgb(var(--color-accent));
  }

  .tab-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    font-weight: 550;
    opacity: 0.8;
  }

  .tab-panel[hidden] {
    display: none;
  }

  .series-jump {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.45rem 0.75rem;
    margin: 0 0 1.35rem;
    padding: 0.15rem 0 0.85rem;
    border-bottom: 1px solid rgb(var(--color-border) / 0.7);
  }

  .series-jump-label {
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: rgb(var(--color-text-base) / 0.45);
  }

  .series-jump-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .series-jump-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 0.4rem;
    border: 1px solid rgb(var(--color-border));
    background: rgb(var(--color-card) / 0.35);
    color: rgb(var(--color-text-base) / 0.78);
    font-size: 0.875rem;
    font-weight: 550;
    letter-spacing: 0.03em;
    padding: 0.28rem 0.65rem;
    text-decoration: none;
  }

  .series-jump-link:hover {
    border-color: rgb(var(--color-accent) / 0.45);
    color: rgb(var(--color-text-base));
    background: rgb(var(--color-card) / 0.65);
  }

  .series-jump-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.7rem;
    font-weight: 550;
    opacity: 0.65;
  }

  .series {
    margin: 0 0 2.5rem;
    width: 100%;
    max-width: none;
    padding: 0;
  }

  .series:last-child {
    margin-bottom: 0;
  }

  .series-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgb(var(--color-border));
  }

  .series-head h2 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    scroll-margin-top: 1.5rem;
  }

  .series-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    color: rgb(var(--color-text-base) / 0.45);
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15.5rem, 1fr));
    column-gap: 0.75rem;
    row-gap: 0.9rem;
    margin: 0;
    padding: 0;
    list-style: none;
    container-type: inline-size;
    container-name: catalog-grid;
  }

  .catalog-tile {
    display: flex;
    min-height: 11.5rem;
    flex-direction: column;
    justify-content: space-between;
    border-radius: 0.5rem;
    border: 1px solid rgb(var(--color-border) / 0.65);
    background-color: transparent;
    padding: 1rem;
    transition:
      border-color 150ms ease,
      background-color 150ms ease,
      box-shadow 150ms ease;
  }

  @container catalog-grid (max-width: 31.74rem) {
    .catalog-tile:nth-child(even) {
      background-color: rgb(var(--color-card));
      border-color: rgb(var(--color-border));
      box-shadow: inset 3px 0 0 rgb(var(--color-accent) / 0.55);
    }
  }

  @container catalog-grid (min-width: 31.75rem) and (max-width: 47.99rem) {
    .catalog-tile:nth-child(4n + 3),
    .catalog-tile:nth-child(4n + 4) {
      background-color: rgb(var(--color-card));
      border-color: rgb(var(--color-border));
      box-shadow: inset 3px 0 0 rgb(var(--color-accent) / 0.55);
    }
  }

  @container catalog-grid (min-width: 48rem) {
    .catalog-tile:nth-child(6n + 4),
    .catalog-tile:nth-child(6n + 5),
    .catalog-tile:nth-child(6n + 6) {
      background-color: rgb(var(--color-card));
      border-color: rgb(var(--color-border));
      box-shadow: inset 3px 0 0 rgb(var(--color-accent) / 0.55);
    }
  }

  .catalog-tile:hover {
    border-color: rgb(var(--color-accent) / 0.55);
    background-color: rgb(var(--color-card));
    box-shadow: inset 3px 0 0 rgb(var(--color-accent));
  }

  .tile-body {
    min-width: 0;
  }

  .tile-head {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    min-width: 0;
  }

  .catalog-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
    letter-spacing: 0.04em;
  }

  .catalog-blurb {
    margin: 0.625rem 0 0;
    font-size: 0.875rem;
    line-height: 1.625;
    color: rgb(var(--color-text-base) / 0.75);
  }

  .tile-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .catalog-repo {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.75rem;
    color: rgb(var(--color-text-base) / 0.45);
    text-decoration: none;
  }

  .catalog-repo:hover {
    color: rgb(var(--color-accent));
  }

  .btn-open {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    background: rgb(var(--color-accent));
    color: rgb(var(--color-fill));
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.375rem 0.875rem;
    text-decoration: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
  }

  .catalog-tile:hover .btn-open,
  .catalog-tile:focus-within .btn-open,
  .catalog-tile:global(.is-cta-open) .btn-open {
    opacity: 1;
    pointer-events: auto;
  }

  /* is-cta-open is toggled from onMount for touch */

  .footnote {
    margin-top: 1rem;
    max-width: 42rem;
    font-size: 0.875rem;
    line-height: 1.625;
    color: rgb(var(--color-text-base) / 0.55);
  }
</style>
