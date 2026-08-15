<script lang="ts">
  /**
   * 進入畫布時的 8-bit 開場：上下閘門拉開 + 掃描線（DEC-050 純玩版）。
   * 純 CSS、無外部資源；`prefers-reduced-motion` 時 store 不會啟動，整段不渲染。
   */
  import { chromeSession } from "$lib/chromeSession.svelte";
  import { goPlayIntro, GO_PLAY_INTRO_MS } from "$lib/playIntro.svelte";

  const active = $derived(goPlayIntro.active);

  $effect(() => {
    const playing = chromeSession.canvasActive;
    // 遊玩中換遊戲（`/s/` swap）也重播一次開場。
    const swappedTo = chromeSession.catalogId;
    if (!playing) {
      goPlayIntro.cancel();
      return;
    }
    void swappedTo;
    goPlayIntro.start();
  });

  $effect(() => () => goPlayIntro.cancel());
</script>

{#if active}
  <div
    class="play-intro"
    aria-hidden="true"
    style="--intro-ms: {GO_PLAY_INTRO_MS}ms"
  >
    <div class="play-intro-shutter play-intro-shutter--top"></div>
    <div class="play-intro-shutter play-intro-shutter--bottom"></div>
  </div>
{/if}

<style>
  .play-intro {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
    overflow: hidden;
  }
  .play-intro-shutter {
    position: absolute;
    left: 0;
    right: 0;
    /* 多 1px 讓兩片在奇數高度視窗也不留縫。 */
    height: calc(50% + 1px);
    background:
      repeating-linear-gradient(
        0deg,
        color-mix(in oklab, rgb(var(--fill)) 10%, transparent) 0,
        color-mix(in oklab, rgb(var(--fill)) 10%, transparent) 2px,
        transparent 2px,
        transparent 4px
      ),
      rgb(var(--ink));
  }
  .play-intro-shutter--top {
    top: 0;
    border-bottom: var(--pixel-edge) solid rgb(var(--accent));
    animation: go-shutter-up var(--intro-ms) steps(7) forwards;
  }
  .play-intro-shutter--bottom {
    bottom: 0;
    border-top: var(--pixel-edge) solid rgb(var(--accent));
    animation: go-shutter-down var(--intro-ms) steps(7) forwards;
  }
  @keyframes go-shutter-up {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-100%);
    }
  }
  @keyframes go-shutter-down {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(100%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .play-intro {
      display: none;
    }
  }
</style>
