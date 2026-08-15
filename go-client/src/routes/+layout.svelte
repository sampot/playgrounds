<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import Chrome from "$lib/Chrome.svelte";
  import GoPlayIntro from "$lib/GoPlayIntro.svelte";
  import GoUnsupported from "$lib/GoUnsupported.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { goBrowserSupports } from "$lib/goCanvasSupport";
  import { registerGoServiceWorker } from "$lib/registerGoSw";
  import { pixelWipe, pixelWipeOut } from "$lib/goTransition";
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
      <!--
        進／離場同格疊放（grid stack），讓離場頁與進場頁在同一格重疊，
        看起來是一道連續的橫向抹除，而不是「消失再出現」。
      -->
      <div class="page-stack">
        {#key page.url.pathname}
          <div class="page-wipe" in:pixelWipe out:pixelWipeOut>
            {@render children()}
          </div>
        {/key}
      </div>
    {/if}
  </main>
</div>

<GoPlayIntro />

<style>
  .page-stack {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    /* 沿用原 `.page-wipe` 的高度契約：遊玩態撐滿（畫布 `height: 100%` 靠此解析），
       其餘頁面隨內容成長。 */
    min-height: 100%;
  }
  .page-wipe {
    grid-area: 1 / 1;
    min-width: 0;
    min-height: 100%;
  }
</style>
