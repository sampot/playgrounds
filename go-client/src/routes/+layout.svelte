<script lang="ts">
  import { onMount } from "svelte";
  import Chrome from "$lib/Chrome.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { registerGoServiceWorker } from "$lib/registerGoSw";
  import "$lib/styles.css";

  let { children } = $props();

  const playing = $derived(chromeSession.canvasActive);

  onMount(() => {
    registerGoServiceWorker();
  });
</script>

<div class={["site", playing && "site--playing"].filter(Boolean).join(" ")}>
  <Chrome />
  <main class={["main", playing && "main--playing"].filter(Boolean).join(" ")}>
    {@render children()}
  </main>
</div>
