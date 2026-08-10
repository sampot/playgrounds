<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import DashAccount from "$lib/components/DashAccount.svelte";
</script>

{#if !dash.me}
  <div class="panel"><p class="meta">請先從上方「使用 GitHub／Google 進入」。</p></div>
{:else}
  <DashAccount />
{/if}
