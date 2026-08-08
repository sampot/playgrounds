<script lang="ts">
  import type { GoLoadProgress } from "./goLoadProgress";

  type Props = {
    progress: GoLoadProgress | null;
    label?: string;
  };

  let { progress, label = "下載進度" }: Props = $props();

  const ratio = $derived(progress?.ratio ?? null);
  const detail = $derived(progress?.detail ?? "");
  const pct = $derived(
    ratio != null ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : null
  );
</script>

{#if progress}
  <div
    class="go-load-bar"
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={pct ?? undefined}
    aria-valuetext={detail || (pct != null ? `${pct}%` : "下載中")}
  >
    <div class="go-load-bar-track">
      {#if pct != null}
        <div class="go-load-bar-fill" style={`width: ${pct}%`}></div>
      {:else}
        <div class="go-load-bar-fill go-load-bar-fill--indeterminate"></div>
      {/if}
    </div>
    {#if detail}
      <p class="go-load-bar-detail">{detail}</p>
    {/if}
  </div>
{/if}
