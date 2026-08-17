<script lang="ts">
  /**
   * Catalog card art: static `/covers/<id>.png` when present, else series icon.
   * Cover ≠ offline-ready (go §5.8).
   */
  import GoSeriesIcon from "./GoSeriesIcon.svelte";

  type Props = {
    cover?: string | null;
    series?: string | null;
    /** Series icon size when there is no cover. */
    size?: number;
    /** Extra class on the outer span / img wrapper. */
    class?: string;
    /** Fill a framed cover slot (home grid) vs inline thumb. */
    variant?: "fill" | "thumb";
  };

  let {
    cover = null,
    series = null,
    size = 20,
    class: className = "",
    variant = "thumb",
  }: Props = $props();

  const hasCover = $derived(Boolean(cover?.trim()));
</script>

{#if hasCover}
  <img
    class={[
      "go-entry-cover",
      variant === "fill" ? "go-entry-cover--fill" : "go-entry-cover--thumb",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    src={cover!.trim()}
    alt=""
    width={variant === "fill" ? 640 : size}
    height={variant === "fill" ? 480 : size}
    loading="lazy"
    decoding="async"
  />
{:else}
  <span
    class={[
      "go-entry-cover-fallback",
      variant === "fill" ? "go-entry-cover-fallback--fill" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ")}
    aria-hidden="true"
  >
    <GoSeriesIcon {series} {size} />
  </span>
{/if}

<style>
  .go-entry-cover--fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    image-rendering: auto;
    display: block;
  }
  .go-entry-cover--thumb {
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    object-fit: cover;
    border-radius: 2px;
    image-rendering: auto;
  }
  .go-entry-cover-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .go-entry-cover-fallback--fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
