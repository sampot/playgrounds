<script lang="ts">
  import { onMount } from "svelte";
  import Chrome from "$lib/Chrome.svelte";
  import GoUnsupported from "$lib/GoUnsupported.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goAuth } from "$lib/goAuth.svelte";
  import { goBrowserSupports } from "$lib/goCanvasSupport";
  import { registerGoServiceWorker } from "$lib/registerGoSw";
  import "$lib/styles.css";

  let { children } = $props();

  /** Static browser capability gate: when unsupported, replace the main
   * content with an in-shell recovery screen (shell chrome still renders). */
  const browserUnsupported = !goBrowserSupports().supported;
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
      {@render children()}
    {/if}
  </main>
</div>
