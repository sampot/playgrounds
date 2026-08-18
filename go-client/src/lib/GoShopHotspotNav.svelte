<script lang="ts">
  import { GO_LOBBY_HOTSPOTS, type ShopHotspotId } from "$lib/goShopHotspots";

  let {
    onSelect,
  }: {
    onSelect: (id: ShopHotspotId) => void;
  } = $props();
</script>

<nav class="lobby-hotspot-nav" aria-label="大廳捷徑">
  {#each GO_LOBBY_HOTSPOTS as spot (spot.id)}
    <button type="button" class="lobby-hotspot-btn pixel-btn" onclick={() => onSelect(spot.id)}>
      {spot.label}
    </button>
  {/each}
</nav>

<style>
  .lobby-hotspot-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.5rem 0 0.75rem;
  }
  .lobby-hotspot-btn {
    min-height: 44px;
    font-size: 0.78rem;
    padding: 0.35rem 0.55rem;
  }
</style>
