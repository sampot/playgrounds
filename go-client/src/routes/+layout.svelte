<script lang="ts">
  import Chrome from "$lib/Chrome.svelte";
  import { chromeSession } from "$lib/chromeSession.svelte";
  import "$lib/styles.css";

  let { children } = $props();

  const playing = $derived(chromeSession.canvasActive);
</script>

<div class={["site", playing && "site--playing"].filter(Boolean).join(" ")}>
  <Chrome />
  <main class={["main", playing && "main--playing"].filter(Boolean).join(" ")}>
    {@render children()}
  </main>
</div>
