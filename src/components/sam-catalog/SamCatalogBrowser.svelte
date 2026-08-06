<script lang="ts">
  import { onMount } from "svelte";
  import SamCatalogEntryRow from "./SamCatalogEntryRow.svelte";
  import SamCatalogPicksShelf from "./SamCatalogPicksShelf.svelte";
  import {
    SAM_KIND_LABEL,
    SAM_KIND_ORDER,
    catalogBrowseShareHref,
    catalogSeriesOptions,
    catalogUrlSearchParams,
    filterCatalogEntries,
    parseCatalogUrlSearch,
    samCatalog,
    samCatalogPage,
    samPlaygroundsPicks,
    type CatalogDensity,
    type CatalogHumanFilter,
    type SamEntry,
    type SamKind,
  } from "../../data/samCatalog";
  import {
    canUseWebShare,
    isShareAbort,
    shareOrCopy,
  } from "../../utils/shareOrCopy";

  let {
    variant = "page",
    syncUrl = variant === "page",
    showPicks = true,
    showFootnote = variant === "page",
    showHero = variant === "page",
    onOpen,
    disabled = false,
    autofocusSearch = true,
  }: {
    variant?: "page" | "panel";
    /** Sync `?q=`／`?kind=`／`?series=` via history.replaceState. */
    syncUrl?: boolean;
    showPicks?: boolean;
    showFootnote?: boolean;
    showHero?: boolean;
    onOpen?: (entry: SamEntry) => void;
    disabled?: boolean;
    autofocusSearch?: boolean;
  } = $props();

  const DENSITY_KEY = "sam-catalog-density-v1";
  const picks = samPlaygroundsPicks();
  const kindOptions = SAM_KIND_ORDER.filter(k =>
    samCatalog.some(e => e.kind === k)
  );

  let q = $state("");
  let selectedKinds = $state<SamKind[]>([]);
  let selectedSeries = $state<string[]>([]);
  let density = $state<CatalogDensity>("compact");
  let searchEl = $state<HTMLInputElement | null>(null);
  let canShare = $state(false);
  let shareBusy = $state(false);
  let flash = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  let filter = $derived<CatalogHumanFilter>({
    q,
    kinds: selectedKinds,
    series: selectedSeries,
  });

  let seriesOptions = $derived(
    catalogSeriesOptions(
      samCatalog,
      selectedKinds.length ? selectedKinds : undefined
    )
  );

  let results = $derived(filterCatalogEntries(samCatalog, filter));

  let hasActiveFilter = $derived(
    Boolean(q.trim() || selectedKinds.length || selectedSeries.length)
  );

  let filterShareLabel = $derived(
    canShare
      ? hasActiveFilter
        ? "分享篩選"
        : "分享型錄"
      : hasActiveFilter
        ? "複製篩選"
        : "複製連結"
  );

  /** Group results by series for scan（preserve catalog series order）. */
  let resultGroups = $derived.by(() => {
    const order = seriesOptions;
    const bySeries = new Map<string, SamEntry[]>();
    for (const e of results) {
      const list = bySeries.get(e.series);
      if (list) list.push(e);
      else bySeries.set(e.series, [e]);
    }
    const groups: { series: string; entries: SamEntry[] }[] = [];
    for (const s of order) {
      const entries = bySeries.get(s);
      if (entries?.length) groups.push({ series: s, entries });
    }
    for (const [s, entries] of bySeries) {
      if (!order.includes(s)) groups.push({ series: s, entries });
    }
    return groups;
  });

  function setFlash(message: string) {
    flash = message;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = null;
      flashTimer = null;
    }, 2400);
  }
  function applyFilter(next: CatalogHumanFilter, { pushUrl = true } = {}) {
    q = next.q;
    selectedKinds = [...next.kinds];
    selectedSeries = next.series.filter(s =>
      catalogSeriesOptions(samCatalog).includes(s)
    );
    if (pushUrl && syncUrl) {
      writeUrl({
        q: next.q,
        kinds: selectedKinds,
        series: selectedSeries,
      });
    }
  }

  function writeUrl(next: CatalogHumanFilter = filter) {
    if (typeof location === "undefined") return;
    const params = catalogUrlSearchParams(next);
    const qs = params.toString();
    const path = `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
    const cur = `${location.pathname}${location.search}${location.hash}`;
    if (path !== cur) history.replaceState(null, "", path);
  }

  function toggleKind(kind: SamKind) {
    const kinds = selectedKinds.includes(kind)
      ? selectedKinds.filter(k => k !== kind)
      : [...selectedKinds, kind];
    const allowed = new Set(
      catalogSeriesOptions(samCatalog, kinds.length ? kinds : undefined)
    );
    const series = selectedSeries.filter(s => allowed.has(s));
    selectedKinds = kinds;
    selectedSeries = series;
    if (syncUrl) writeUrl({ q, kinds, series });
  }

  function toggleSeries(series: string) {
    const next = selectedSeries.includes(series)
      ? selectedSeries.filter(s => s !== series)
      : [...selectedSeries, series];
    selectedSeries = next;
    if (syncUrl) writeUrl({ q, kinds: selectedKinds, series: next });
  }

  function clearFilters() {
    applyFilter({ q: "", kinds: [], series: [] });
  }

  function onSearchInput(ev: Event) {
    const nextQ = (ev.currentTarget as HTMLInputElement).value;
    q = nextQ;
    if (syncUrl) {
      writeUrl({ q: nextQ, kinds: selectedKinds, series: selectedSeries });
    }
  }

  function setDensity(next: CatalogDensity) {
    density = next;
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function handleShareFilter() {
    if (shareBusy || disabled) return;
    shareBusy = true;
    try {
      const url = catalogBrowseShareHref(filter);
      const result = await shareOrCopy({
        title: hasActiveFilter
          ? `${samCatalogPage.title}（篩選 ${results.length} 筆）`
          : samCatalogPage.title,
        url,
      });
      setFlash(
        result === "shared"
          ? "已分享型錄連結"
          : hasActiveFilter
            ? "已複製篩選連結"
            : "已複製型錄連結"
      );
    } catch (e) {
      if (isShareAbort(e)) return;
      setFlash(e instanceof Error ? e.message : String(e));
    } finally {
      shareBusy = false;
    }
  }

  function parseLegacyHash(): Partial<CatalogHumanFilter> | null {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!raw) return null;
    const seriesMatch = /^series-(tool|agent|game|toy|media)-(.+)$/.exec(raw);
    if (seriesMatch?.[1] && seriesMatch[2]) {
      const kind = seriesMatch[1] as SamKind;
      // series id in hash used series slug; page used display name as id historically
      // `#series-{kind}-{series}` where series is the display label in current page.
      return { kinds: [kind], series: [seriesMatch[2]] };
    }
    if (KIND_SET_HAS(raw)) {
      return { kinds: [raw as SamKind] };
    }
    return null;
  }

  function KIND_SET_HAS(k: string): boolean {
    return (SAM_KIND_ORDER as readonly string[]).includes(k);
  }

  function readInitialFromLocation(): CatalogHumanFilter {
    const fromQuery = parseCatalogUrlSearch(location.search);
    if (
      fromQuery.q ||
      fromQuery.kinds.length ||
      fromQuery.series.length
    ) {
      return fromQuery;
    }
    const legacy = parseLegacyHash();
    if (legacy) {
      return {
        q: "",
        kinds: legacy.kinds ?? [],
        series: legacy.series ?? [],
      };
    }
    return { q: "", kinds: [], series: [] };
  }

  onMount(() => {
    canShare = canUseWebShare();
    try {
      const stored = localStorage.getItem(DENSITY_KEY);
      if (stored === "compact" || stored === "comfortable") density = stored;
    } catch {
      /* ignore */
    }

    if (syncUrl) {
      applyFilter(readInitialFromLocation(), { pushUrl: false });
      // Clear bare kind／series hashes once query owns state (keep shareable ?).
      if (location.hash && (selectedKinds.length || selectedSeries.length)) {
        const params = catalogUrlSearchParams(filter);
        const qs = params.toString();
        history.replaceState(
          null,
          "",
          `${location.pathname}${qs ? `?${qs}` : ""}`
        );
      }
    }

    if (autofocusSearch && variant === "page") {
      queueMicrotask(() => searchEl?.focus());
    }

    return () => {
      if (flashTimer) clearTimeout(flashTimer);
    };
  });
</script>

<div
  class={[
    "sam-catalog-browser",
    variant === "panel" && "sam-catalog-browser--panel",
  ]
    .filter(Boolean)
    .join(" ")}
>
  {#if showHero}
    <header class="catalog-hero">
      <h1>{samCatalogPage.title}</h1>
      <p class="lede">{@html samCatalogPage.lede}</p>
      <p class="meta">共 {samCatalog.length} 款</p>
    </header>
  {/if}

  {#if showPicks && !hasActiveFilter}
    <SamCatalogPicksShelf
      {picks}
      {onOpen}
      {disabled}
      dense={variant === "panel"}
    />
  {/if}

  <div class="catalog-layout">
    <aside class="catalog-filters" aria-label="篩選">
      <label class="search-label" for="sam-catalog-q">搜尋</label>
      <input
        bind:this={searchEl}
        id="sam-catalog-q"
        class="search-input"
        type="search"
        name="q"
        placeholder="名稱、id、簡介、系列…"
        value={q}
        autocomplete="off"
        spellcheck="false"
        oninput={onSearchInput}
      />

      <div class="filter-block">
        <p class="filter-label" id="kind-filter-label">類型</p>
        <div
          class="chip-row"
          role="group"
          aria-labelledby="kind-filter-label"
        >
          {#each kindOptions as kind}
            <button
              type="button"
              class="chip"
              aria-pressed={selectedKinds.includes(kind)}
              onclick={() => toggleKind(kind)}
            >
              {SAM_KIND_LABEL[kind]}
            </button>
          {/each}
        </div>
      </div>

      {#if seriesOptions.length > 1}
        <div class="filter-block filter-block--series">
          <p class="filter-label" id="series-filter-label">系列</p>
          <div
            class="chip-row chip-row--wrap"
            role="group"
            aria-labelledby="series-filter-label"
          >
            {#each seriesOptions as series}
              <button
                type="button"
                class="chip chip--series"
                aria-pressed={selectedSeries.includes(series)}
                onclick={() => toggleSeries(series)}
              >
                {series}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      {#if hasActiveFilter}
        <button type="button" class="clear-btn" onclick={clearFilters}>
          清除篩選
        </button>
      {/if}
    </aside>

    <div class="catalog-results">
      <div class="results-toolbar">
        <p class="results-count" aria-live="polite">
          {#if hasActiveFilter}
            {results.length} 筆結果
          {:else}
            全庫 {results.length} 款
          {/if}
        </p>
        <div class="results-toolbar-actions">
          <button
            type="button"
            class="share-filter-btn"
            disabled={disabled || shareBusy}
            title={canShare ? "分享目前型錄連結" : "複製目前型錄連結"}
            onclick={() => void handleShareFilter()}
          >
            {filterShareLabel}
          </button>
          <div
            class="density-toggle"
            role="group"
            aria-label="列表密度"
          >
            <button
              type="button"
              class="density-btn"
              aria-pressed={density === "compact"}
              onclick={() => setDensity("compact")}
            >
              緊密
            </button>
            <button
              type="button"
              class="density-btn"
              aria-pressed={density === "comfortable"}
              onclick={() => setDensity("comfortable")}
            >
              寬鬆
            </button>
          </div>
        </div>
      </div>

      {#if flash}
        <p class="share-flash" role="status">{flash}</p>
      {/if}

      {#if results.length === 0}
        <div class="empty-results" role="status">
          <p>沒有符合的小品。</p>
          <button type="button" class="clear-btn" onclick={clearFilters}>
            清除篩選
          </button>
        </div>
      {:else}
        {#each resultGroups as group (group.series)}
          <section class="result-series" aria-labelledby="series-{group.series}">
            <div class="result-series-head">
              <h2 id="series-{group.series}">{group.series}</h2>
              <span class="result-series-count">{group.entries.length}</span>
            </div>
            <ul class="result-list">
              {#each group.entries as entry (entry.id)}
                <SamCatalogEntryRow
                  {entry}
                  {density}
                  {onOpen}
                  {disabled}
                  onShareResult={setFlash}
                />
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </div>
  </div>

  {#if showFootnote}
    <p class="footnote">{@html samCatalogPage.footnote}</p>
  {/if}
</div>

<style>
  .sam-catalog-browser {
    margin-inline: auto;
    width: 100%;
    max-width: min(88rem, 100%);
    padding: 1.25rem 1rem 5rem;
  }

  .sam-catalog-browser--panel {
    max-width: none;
    padding: 0.75rem 0.85rem 1.25rem;
  }

  .catalog-hero {
    margin-bottom: 1.25rem;
  }

  .catalog-hero h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  @media (min-width: 640px) {
    .catalog-hero h1 {
      font-size: 1.75rem;
    }
  }

  .lede {
    margin: 0.5rem 0 0;
    max-width: 36rem;
    font-size: 0.95rem;
    line-height: 1.5;
    color: rgb(var(--color-text-base) / 0.78);
  }

  .lede :global(a) {
    color: rgb(var(--color-accent));
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 4px;
  }

  .lede :global(strong) {
    font-weight: 600;
    color: rgb(var(--color-text-base));
  }

  .meta {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: rgb(var(--color-text-base) / 0.5);
  }

  .catalog-layout {
    display: grid;
    gap: 1.25rem;
  }

  @media (min-width: 900px) {
    .catalog-layout {
      grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr);
      align-items: start;
      gap: 1.75rem;
    }
  }

  .catalog-filters {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    position: sticky;
    top: 0;
    z-index: 2;
    margin-inline: -0.25rem;
    padding: 0.5rem 0.25rem 0.75rem;
    background: rgb(var(--color-fill));
  }

  .sam-catalog-browser--panel .catalog-filters {
    position: static;
    z-index: auto;
    margin-inline: 0;
    padding: 0;
    background: transparent;
  }

  .search-label,
  .filter-label {
    margin: 0;
    font-size: 0.7rem;
    font-weight: 650;
    letter-spacing: 0.08em;
    color: rgb(var(--color-text-base) / 0.45);
  }

  .search-input {
    width: 100%;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.45rem;
    background: rgb(var(--color-fill));
    color: rgb(var(--color-text-base));
    font: inherit;
    font-size: 0.9rem;
    padding: 0.55rem 0.75rem;
  }

  .search-input:focus {
    outline: 2px solid rgb(var(--color-accent) / 0.45);
    outline-offset: 1px;
    border-color: rgb(var(--color-accent) / 0.55);
  }

  .filter-block {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chip {
    margin: 0;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.4rem;
    background: rgb(var(--color-card));
    color: rgb(var(--color-text-base) / 0.78);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 550;
    padding: 0.28rem 0.65rem;
    cursor: pointer;
  }

  .chip:hover {
    border-color: rgb(var(--color-accent) / 0.4);
    color: rgb(var(--color-text-base));
  }

  .chip[aria-pressed="true"] {
    border-color: transparent;
    background: rgb(var(--color-accent));
    color: rgb(var(--color-fill));
  }

  .chip--series {
    font-size: 0.75rem;
  }

  .clear-btn {
    align-self: flex-start;
    margin: 0;
    border: 0;
    border-radius: 0.35rem;
    background: transparent;
    color: rgb(var(--color-accent));
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 3px;
  }

  .results-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .results-toolbar-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
  }

  .results-count {
    margin: 0;
    font-size: 0.8rem;
    color: rgb(var(--color-text-base) / 0.55);
  }

  .share-filter-btn {
    margin: 0;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.4rem;
    background: transparent;
    color: rgb(var(--color-text-base) / 0.72);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.28rem 0.55rem;
    cursor: pointer;
  }

  .share-filter-btn:hover:not(:disabled) {
    border-color: rgb(var(--color-accent) / 0.45);
    color: rgb(var(--color-text-base));
  }

  .share-filter-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .share-flash {
    margin: -0.35rem 0 0.65rem;
    font-size: 0.75rem;
    color: rgb(var(--color-accent));
  }

  .density-toggle {
    display: inline-flex;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.4rem;
    overflow: hidden;
  }

  .density-btn {
    margin: 0;
    border: 0;
    background: transparent;
    color: rgb(var(--color-text-base) / 0.65);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.28rem 0.55rem;
    cursor: pointer;
  }

  .density-btn[aria-pressed="true"] {
    background: rgb(var(--color-card));
    color: rgb(var(--color-text-base));
  }

  .empty-results {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1.5rem 0.25rem;
    color: rgb(var(--color-text-base) / 0.6);
    font-size: 0.9rem;
  }

  .empty-results p {
    margin: 0;
  }

  .result-series {
    margin: 0 0 1.35rem;
  }

  .result-series:last-child {
    margin-bottom: 0;
  }

  .result-series-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.35rem;
    border-bottom: 1px solid rgb(var(--color-border) / 0.7);
  }

  .result-series-head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    scroll-margin-top: 1rem;
  }

  .result-series-count {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.7rem;
    color: rgb(var(--color-text-base) / 0.4);
  }

  .result-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .footnote {
    margin-top: 2rem;
    max-width: 42rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: rgb(var(--color-text-base) / 0.55);
  }

  .footnote :global(a) {
    color: rgb(var(--color-accent));
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 4px;
  }

  .footnote :global(strong) {
    font-weight: 600;
    color: rgb(var(--color-text-base));
  }
</style>
