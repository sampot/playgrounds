<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  onMount(() => {
    void goto("/", { replaceState: true });
  });
</script>

<main class="main">
  <p class="meta">導向後台…</p>
</main>
