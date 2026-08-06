<script lang="ts">
  import { onMount } from "svelte";
  import SamCatalogIcon from "@components/SamCatalogIcon.svelte";
  import {
    SAM_KIND_LABEL,
    samOpenHref,
    samOpenShareHref,
    samSourceHref,
    type CatalogDensity,
    type SamEntry,
  } from "../../data/samCatalog";
  import {
    canUseWebShare,
    isShareAbort,
    shareOrCopy,
  } from "../../utils/shareOrCopy";

  let {
    entry,
    density = "compact",
    onOpen,
    disabled = false,
    onShareResult,
  }: {
    entry: SamEntry;
    density?: CatalogDensity;
    /** Shell／panel：in-place open. Page：omit → `/?open=` link. */
    onOpen?: (entry: SamEntry) => void;
    disabled?: boolean;
    onShareResult?: (message: string) => void;
  } = $props();

  let blurbOpen = $state(false);
  let shareBusy = $state(false);
  let canShare = $state(false);
  let showBlurb = $derived(density === "comfortable" || blurbOpen);
  let shareLabel = $derived(canShare ? "分享" : "複製連結");

  onMount(() => {
    canShare = canUseWebShare();
  });

  async function handleShare() {
    if (shareBusy || disabled) return;
    shareBusy = true;
    try {
      const result = await shareOrCopy({
        title: entry.title,
        text: entry.blurb,
        url: samOpenShareHref(entry),
      });
      onShareResult?.(
        result === "shared"
          ? `已分享「${entry.title}」`
          : `已複製開啟連結（${entry.title}）`
      );
    } catch (e) {
      if (isShareAbort(e)) return;
      onShareResult?.(e instanceof Error ? e.message : String(e));
    } finally {
      shareBusy = false;
    }
  }
</script>

<li class={["catalog-row", density === "comfortable" && "catalog-row--comfy"].filter(Boolean).join(" ")}>
  <div class="catalog-row-main">
    <SamCatalogIcon
      repo={entry.repo}
      title={entry.title}
      size={density === "compact" ? "sm" : "md"}
    />
    <div class="catalog-row-text">
      <div class="catalog-row-title-line">
        <h3 class="catalog-row-title">{entry.title}</h3>
        <span class="catalog-row-meta">
          {SAM_KIND_LABEL[entry.kind]}
          <span aria-hidden="true">·</span>
          {entry.series}
        </span>
      </div>
      {#if showBlurb}
        <p class="catalog-row-blurb">{entry.blurb}</p>
      {:else}
        <button
          type="button"
          class="catalog-row-more"
          onclick={() => (blurbOpen = true)}
        >
          簡介
        </button>
      {/if}
      <a
        class="catalog-row-id"
        href={samSourceHref(entry.source)}
        rel="noopener noreferrer"
        target="_blank"
      >
        {entry.id}
      </a>
    </div>
  </div>
  <div class="catalog-row-actions">
    <button
      type="button"
      class="catalog-row-share"
      disabled={disabled || shareBusy}
      title={canShare ? "分享開啟連結" : "複製開啟連結"}
      onclick={() => void handleShare()}
    >
      {shareLabel}
    </button>
    {#if onOpen}
      <button
        type="button"
        class="catalog-row-open"
        {disabled}
        onclick={() => onOpen(entry)}
      >
        一鍵開
      </button>
    {:else}
      <a class="catalog-row-open" href={samOpenHref(entry)}>一鍵開</a>
    {/if}
  </div>
</li>

<style>
  .catalog-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin: 0;
    padding: 0.55rem 0.65rem;
    border-radius: 0.45rem;
    border: 1px solid rgb(var(--color-border) / 0.65);
    background: transparent;
    list-style: none;
  }

  .catalog-row:hover {
    border-color: rgb(var(--color-accent) / 0.45);
    background: rgb(var(--color-card) / 0.55);
  }

  .catalog-row--comfy {
    align-items: flex-start;
    padding: 0.85rem 0.9rem;
  }

  .catalog-row-main {
    display: flex;
    align-items: flex-start;
    gap: 0.65rem;
    min-width: 0;
    flex: 1;
  }

  .catalog-row-text {
    min-width: 0;
    flex: 1;
  }

  .catalog-row-title-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem 0.65rem;
  }

  .catalog-row-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .catalog-row--comfy .catalog-row-title {
    font-size: 1.05rem;
  }

  .catalog-row-meta {
    font-size: 0.7rem;
    font-weight: 550;
    letter-spacing: 0.03em;
    color: rgb(var(--color-text-base) / 0.45);
  }

  .catalog-row-blurb {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: rgb(var(--color-text-base) / 0.72);
  }

  .catalog-row-more {
    margin: 0.2rem 0 0;
    padding: 0;
    border: 0;
    background: none;
    color: rgb(var(--color-accent));
    font: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dashed;
    text-underline-offset: 2px;
  }

  .catalog-row-id {
    display: inline-block;
    margin-top: 0.2rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.68rem;
    color: rgb(var(--color-text-base) / 0.4);
    text-decoration: none;
  }

  .catalog-row-id:hover {
    color: rgb(var(--color-accent));
  }

  .catalog-row-actions {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    align-self: center;
    gap: 0.35rem;
  }

  .catalog-row-share {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgb(var(--color-border));
    border-radius: 0.375rem;
    background: transparent;
    color: rgb(var(--color-text-base) / 0.72);
    font: inherit;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.35rem 0.65rem;
    cursor: pointer;
  }

  .catalog-row-share:hover:not(:disabled) {
    border-color: rgb(var(--color-accent) / 0.45);
    color: rgb(var(--color-text-base));
  }

  .catalog-row-share:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .catalog-row-open {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0.375rem;
    background: rgb(var(--color-accent));
    color: rgb(var(--color-fill));
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.4rem 0.8rem;
    text-decoration: none;
    cursor: pointer;
  }

  .catalog-row-open:hover {
    opacity: 0.92;
  }

  .catalog-row-open:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
