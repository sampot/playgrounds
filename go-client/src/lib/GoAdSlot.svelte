<script lang="ts">
  /**
   * Shell ad slot (DEC-054). Phase 1 = house self-promo of another listed game.
   * Fixed IAB dimensions: 320×100 narrow / 728×90 wide. Never blocks SAM load.
   */
  import GoEntryCover from "./GoEntryCover.svelte";
  import {
    goAdsEnabled,
    goAdsProvider,
    isStandaloneDisplay,
    shouldShowGoAdSlot,
  } from "./goAds";
  import { pickHouseGame } from "./goAdsProviders/house";
  import type { GoCatalogEntry } from "./goCatalog";

  type Props = {
    /** Current `/s/<id>` — excluded from house pick. Omit on home. */
    excludeCatalogId?: string | null;
    /** When true (canvas booted), slot hides. */
    canvasActive?: boolean;
    /** If set, the slot does not navigate; caller handles (e.g. booth leave confirm). */
    onNavigate?: (href: string) => void;
  };

  let {
    excludeCatalogId = null,
    canvasActive = false,
    onNavigate,
  }: Props = $props();

  let entry = $state<GoCatalogEntry | null>(null);
  /** Stabilize pick so effect re-runs do not reshuffle the creative. */
  let lockedExcl: string | null | undefined = undefined;

  $effect(() => {
    const excl = excludeCatalogId ?? null;
    const active = canvasActive;
    if (
      !shouldShowGoAdSlot({
        enabled: goAdsEnabled(),
        canvasActive: active,
      })
    ) {
      entry = null;
      lockedExcl = undefined;
      return;
    }
    if (lockedExcl === excl && entry) return;
    void goAdsProvider({
      standalone:
        typeof window !== "undefined" ? isStandaloneDisplay() : false,
    });
    entry = pickHouseGame(excl);
    lockedExcl = excl;
  });

  const visible = $derived(Boolean(entry) && !canvasActive && goAdsEnabled());
</script>

{#if visible && entry}
  <aside class="go-ad-slot" aria-label="廣告：本站小品推薦">
    <a
      class="go-ad-slot-link"
      href={`/s/${encodeURIComponent(entry.id)}`}
      data-go-ad="house"
      onclick={(e) => {
        if (!onNavigate) return;
        e.preventDefault();
        onNavigate(`/s/${encodeURIComponent(entry.id)}`);
      }}
    >
      <span class="go-ad-slot-art" aria-hidden="true">
        <GoEntryCover
          cover={entry.cover}
          series={entry.series}
          variant="fill"
          size={40}
        />
      </span>
      <span class="go-ad-slot-copy">
        <span class="go-ad-slot-kicker">廣告・本站推薦</span>
        <span class="go-ad-slot-title">{entry.title}</span>
      </span>
    </a>
  </aside>
{/if}

<style>
  .go-ad-slot {
    box-sizing: border-box;
    width: 320px;
    height: 100px;
    max-width: 100%;
    margin: 0.85rem auto 0;
    flex-shrink: 0;
  }

  @media (min-width: 48rem) {
    .go-ad-slot {
      width: 728px;
      height: 90px;
    }
  }

  .go-ad-slot-link {
    --go-ad-border: color-mix(
      in oklab,
      rgb(var(--gold)) 78%,
      rgb(var(--ink))
    );
    --go-ad-surface: color-mix(
      in oklab,
      rgb(var(--gold-soft)) 24%,
      rgb(var(--fill))
    );
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: stretch;
    gap: 0.55rem;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 0.35rem 0.55rem 0.35rem 0.35rem;
    text-decoration: none;
    color: inherit;
    border: var(--pixel-edge) solid var(--go-ad-border);
    border-radius: var(--radius);
    background: var(--go-ad-surface);
    box-shadow:
      inset 0 0 0 2px
        color-mix(in oklab, rgb(var(--gold-soft)) 42%, transparent),
      0 3px 0 0 var(--go-ad-border);
    overflow: hidden;
  }

  @media (min-width: 48rem) {
    .go-ad-slot-link {
      grid-template-columns: 120px minmax(0, 1fr);
      gap: 0.75rem;
      padding: 0.4rem 0.75rem 0.4rem 0.4rem;
    }
  }

  .go-ad-slot-link:hover,
  .go-ad-slot-link:focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
  }

  .go-ad-slot-art {
    position: relative;
    display: block;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 2px solid var(--go-ad-border);
    border-radius: 2px;
    background: color-mix(
      in oklab,
      rgb(var(--gold-soft)) 18%,
      rgb(var(--fill))
    );
  }

  .go-ad-slot-copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
    min-width: 0;
  }

  .go-ad-slot-kicker {
    align-self: flex-start;
    padding: 0.16rem 0.32rem;
    font-family: var(--pixel);
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: rgb(38 32 28);
    border: 1px solid var(--go-ad-border);
    border-radius: 2px;
    background: rgb(var(--gold-soft));
    text-transform: none;
  }

  .go-ad-slot-title {
    font-family: var(--pixel);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.25;
    color: rgb(var(--ink));
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  @media (min-width: 48rem) {
    .go-ad-slot-title {
      font-size: 1.05rem;
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }
</style>
