<script lang="ts">
  import { dash } from "$lib/dash.svelte";
  import DashOps from "$lib/components/DashOps.svelte";
</script>

{#if !dash.me}
  <div class="panel"><p class="meta">請先從上方「使用 GitHub／Google 進入」。</p></div>
{:else if !dash.isAdmin}
  <div class="panel"><p class="meta">此頁僅供管理者。</p></div>
{:else}
  <DashOps />
{/if}
