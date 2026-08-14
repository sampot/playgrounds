<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import Chrome from "$lib/Chrome.svelte";
  import GoUnsupported from "$lib/GoUnsupported.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { goBrowserSupports } from "$lib/goCanvasSupport";
  import { registerGoServiceWorker } from "$lib/registerGoSw";
  import { pixelWipe } from "$lib/goTransition";
  import "$lib/styles.css";

  let { children } = $props();

  /**
   * Browser capability gate. Computed synchronously when running client-side so
   * the very first paint already shows the right content (no unsupported→content
   * flash on capable browsers). On SSR/prerender `browser` is false so we assume
   * capable and render the real page; the client then re-decides on hydration.
   */
  const browserUnsupported = $state(browser && !goBrowserSupports().supported);
  const playing = $derived(chromeSession.canvasActive);

  onMount(() => {
    if (!browserUnsupported) {
      registerGoServiceWorker();
      void goAuth.initFromLocation();
    }
  });
</script>

<div class={["site", playing && "site--playing"].filter(Boolean).join(" ")}>
  <Chrome />
  <main class={["main", playing && "main--playing"].filter(Boolean).join(" ")}>
    {#if browserUnsupported}
      <GoUnsupported />
    {:else}
      {#key page.url.pathname}
        <div class="page-wipe" in:pixelWipe>
          {@render children()}
        </div>
      {/key}
    {/if}
  </main>
</div>

<style>
  .page-wipe {
    min-height: 100%;
  }
</style>
