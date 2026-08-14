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

  /** Block game launch on browsers missing a required API. Checked once at
   * module init — these are static browser capabilities, not runtime state. */
  let browserUnsupported = $state(!goBrowserSupports().supported);
  const playing = $derived(chromeSession.canvasActive);

  onMount(() => {
    if (!browserUnsupported) {
      registerGoServiceWorker();
      void goAuth.initFromLocation();
    }
  });
</script>

{#if browserUnsupported}
  <GoUnsupported />
{:else}
  <div class={["site", playing && "site--playing"].filter(Boolean).join(" ")}>
    <Chrome />
    <main class={["main", playing && "main--playing"].filter(Boolean).join(" ")}>
      {@render children()}
    </main>
  </div>
{/if}
