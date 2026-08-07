<script lang="ts">
  import Chrome from "$lib/Chrome.svelte";
  import "$lib/styles.css";

  let { children } = $props();
</script>

<div class="site">
  <Chrome />
  <main class="main">
    {@render children()}
  </main>
</div>
