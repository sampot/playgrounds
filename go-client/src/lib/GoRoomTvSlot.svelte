<script lang="ts">
  import { attachMediaStream } from "$lib/goRoom";

  let {
    tvOn = false,
    tvStream = null,
    onOpen,
    videoEl = $bindable<HTMLVideoElement | null>(null),
  }: {
    tvOn?: boolean;
    tvStream?: MediaStream | null;
    onOpen: () => void;
    videoEl?: HTMLVideoElement | null;
  } = $props();

  $effect(() => {
    attachMediaStream(videoEl, tvStream);
  });
</script>

<div class="tv-slot">
  <button type="button" class="tv-hit" aria-label="包廂電視" onclick={onOpen}>
    <video
      bind:this={videoEl}
      class={["tv-video", !tvOn && "tv-video--off"].filter(Boolean).join(" ")}
      autoplay
      playsinline
      aria-label="包廂電視"
    ></video>
    {#if !tvOn}
      <span class="tv-snow" aria-hidden="true"></span>
    {/if}
  </button>
</div>

<style>
  .tv-slot {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 0;
    background: #0a0a0e;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    box-shadow: var(--pixel-shadow);
    overflow: hidden;
  }
  .tv-hit {
    display: block;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    position: relative;
  }
  .tv-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
  }
  .tv-video--off {
    opacity: 0;
  }
  .tv-snow {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      repeating-linear-gradient(
        0deg,
        #1a1a22 0 1px,
        #0c0c10 1px 3px
      );
    opacity: 0.85;
  }
</style>
