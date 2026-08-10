<script lang="ts">
  import {
    SAM_KIND_LABEL,
    samCatalogOpenHref,
    samPlaygroundsPicks,
    type CatalogOpenMode,
    type SamEntry,
  } from "../../data/samCatalog";

  let {
    picks = samPlaygroundsPicks(),
    onOpen,
    openMode = "field",
    disabled = false,
    dense = false,
    showHeading = true,
  }: {
    picks?: SamEntry[];
    onOpen?: (entry: SamEntry) => void;
    /** `go`：精選卡 → go `/s/<id>`（忽略 onOpen）. */
    openMode?: CatalogOpenMode;
    disabled?: boolean;
    /** Tighter chips for panel／dialog. */
    dense?: boolean;
    showHeading?: boolean;
  } = $props();

  let useFieldOnOpen = $derived(openMode === "field" && Boolean(onOpen));
  let picksDesc = $derived(
    openMode === "go"
      ? "精選小品——點一下就開玩"
      : "精選小品——點一下就開進本場"
  );
</script>

<section
  class={["picks-shelf", dense && "picks-shelf--dense"].filter(Boolean).join(" ")}
  aria-label={showHeading ? undefined : "精選小品"}
  aria-labelledby={showHeading ? "picks-shelf-heading" : undefined}
>
  {#if showHeading}
    <div class="picks-shelf-head">
      <h2 id="picks-shelf-heading">玩玩看</h2>
      <p class="picks-shelf-desc">{picksDesc}</p>
    </div>
  {/if}
  <ul class="picks-shelf-list" aria-label="精選小品">
    {#each picks as entry (entry.id)}
      <li>
        {#if useFieldOnOpen}
          <button
            type="button"
            class="picks-shelf-card"
            {disabled}
            title={entry.blurb}
            onclick={() => onOpen?.(entry)}
          >
            <span class="picks-shelf-kind">{SAM_KIND_LABEL[entry.kind]}</span>
            <span class="picks-shelf-title">{entry.title}</span>
            <span class="picks-shelf-blurb">{entry.blurb}</span>
          </button>
        {:else}
          <a
            class="picks-shelf-card"
            href={samCatalogOpenHref(entry, openMode)}
            title={entry.blurb}
          >
            <span class="picks-shelf-kind">{SAM_KIND_LABEL[entry.kind]}</span>
            <span class="picks-shelf-title">{entry.title}</span>
            <span class="picks-shelf-blurb">{entry.blurb}</span>
          </a>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .picks-shelf {
    margin: 0 0 1.5rem;
  }

  .picks-shelf-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.85rem;
    margin-bottom: 0.65rem;
  }

  .picks-shelf-head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 650;
    letter-spacing: 0.04em;
  }

  .picks-shelf-desc {
    margin: 0;
    font-size: 0.75rem;
    color: rgb(var(--color-text-base) / 0.5);
  }

  .picks-shelf-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10.5rem, 1fr));
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .picks-shelf--dense .picks-shelf-list {
    grid-template-columns: repeat(auto-fill, minmax(9.25rem, 1fr));
  }

  .picks-shelf-card {
    display: flex;
    width: 100%;
    min-height: 5.25rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.45rem;
    background: rgb(var(--color-card) / 0.45);
    padding: 0.65rem 0.7rem;
    text-align: left;
    text-decoration: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .picks-shelf-card:hover:not(:disabled) {
    border-color: rgb(var(--color-accent) / 0.5);
    background: rgb(var(--color-card) / 0.85);
  }

  .picks-shelf-card:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .picks-shelf-kind {
    font-size: 0.65rem;
    font-weight: 650;
    letter-spacing: 0.04em;
    color: rgb(var(--color-accent));
  }

  .picks-shelf-title {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .picks-shelf-blurb {
    font-size: 0.65rem;
    line-height: 1.35;
    color: rgb(var(--color-text-base) / 0.55);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
