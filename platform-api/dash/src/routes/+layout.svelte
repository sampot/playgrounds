<script lang="ts">
  import "../lib/styles.css";
  import TopNav from "$lib/components/TopNav.svelte";

  let { children } = $props();
</script>

<div class="site">
  <TopNav current="dash" />
  {@render children()}
</div>
