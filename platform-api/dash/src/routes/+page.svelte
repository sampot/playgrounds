<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import DashField from "$lib/components/DashField.svelte";
</script>

{#if dash.me}
  <DashField />
{/if}