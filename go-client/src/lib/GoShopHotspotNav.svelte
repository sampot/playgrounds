<script lang="ts">
  import { GO_LOBBY_HOTSPOTS, type ShopHotspotId } from "$lib/goShopHotspots";

  let {
    onSelect,
    sfxEnabled = true,
  }: {
    onSelect: (id: ShopHotspotId) => void;
    sfxEnabled?: boolean;
  } = $props();
</script>

<details class="lobby-hotspot-wrap">
  <summary class="lobby-hotspot-summary">大廳捷徑</summary>
  <nav class="lobby-hotspot-nav" aria-label="大廳捷徑">
    {#each GO_LOBBY_HOTSPOTS as spot (spot.id)}
      <button
        type="button"
        class="lobby-hotspot-btn pixel-btn"
        onclick={() => onSelect(spot.id)}
        aria-pressed={spot.id === "sfx" ? sfxEnabled : undefined}
      >
        {spot.id === "sfx" ? (sfxEnabled ? "音效開" : "音效關") : spot.label}
      </button>
    {/each}
  </nav>
</details>

<style>
  .lobby-hotspot-wrap {
    margin: 0.5rem 0 0.75rem;
  }
  .lobby-hotspot-summary {
    min-height: 44px;
    display: flex;
    align-items: center;
    font-family: var(--pixel);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
  }
  .lobby-hotspot-summary:focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
  }
  .lobby-hotspot-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.4rem 0 0;
  }
  .lobby-hotspot-btn {
    min-height: 44px;
    font-size: 0.78rem;
    padding: 0.35rem 0.55rem;
  }
</style>
