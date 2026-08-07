<script lang="ts">
  let {
    message = "",
    kind = "ok",
  }: { message?: string; kind?: "ok" | "warn" | "err" } = $props();
</script>

{#if message}
  <div class="flash {kind}" role="status" aria-live="polite">{message}</div>
{/if}
