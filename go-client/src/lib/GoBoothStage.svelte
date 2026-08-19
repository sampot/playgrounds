<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import {
    boothTvOverlay,
    computeBoothCanvasLayout,
    drawBoothFrame,
  } from "$lib/goBoothCanvas";
  import {
    GO_BOOTH_HOTSPOTS,
    hitTestBoothHotspot,
    type BoothHotspotId,
  } from "$lib/goBoothHotspots";
  import {
    attachMediaStream,
    ROOM_SHORT_LANDSCAPE_MQ,
    type RoomOccupant,
  } from "$lib/goRoom";
  import {
    screenToWorld,
    type CanvasLayout,
  } from "$lib/goShopCanvas";

  let {
    occupants = [],
    tvOn = false,
    tvStream = null,
    overlayOpen = false,
    showTools = true,
    inviteEnabled = true,
    onHotspot,
    children,
  }: {
    occupants?: readonly RoomOccupant[];
    tvOn?: boolean;
    tvStream?: MediaStream | null;
    overlayOpen?: boolean;
    showTools?: boolean;
    inviteEnabled?: boolean;
    onHotspot: (id: BoothHotspotId) => void;
    children?: Snippet;
  } = $props();

  let frameEl = $state<HTMLDivElement | null>(null);
  let wrapEl = $state<HTMLDivElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let tvEl = $state<HTMLVideoElement | null>(null);
  let layout = $state<CanvasLayout | null>(null);
  let hoverHotspot = $state<BoothHotspotId | null>(null);
  let nowMs = $state(0);
  let reducedMotion = $state(false);

  const overlay = $derived(layout ? boothTvOverlay(layout) : null);

  function applyLayout() {
    const box = frameEl ?? wrapEl;
    if (!box || !wrapEl || !canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    const compact =
      typeof window.matchMedia === "function" &&
      window.matchMedia(ROOM_SHORT_LANDSCAPE_MQ).matches;
    layout = computeBoothCanvasLayout(
      box.clientWidth,
      dpr,
      compact ? box.clientHeight : undefined
    );
    wrapEl.style.width = `${layout.cssWidth}px`;
    wrapEl.style.height = `${layout.cssHeight}px`;
    canvasEl.width = Math.round(layout.cssWidth * layout.dpr);
    canvasEl.height = Math.round(layout.cssHeight * layout.dpr);
    canvasEl.style.width = `${layout.cssWidth}px`;
    canvasEl.style.height = `${layout.cssHeight}px`;
  }

  function paint() {
    if (!canvasEl || !layout) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.setTransform(
      layout.dpr * layout.scale,
      0,
      0,
      layout.dpr * layout.scale,
      0,
      0
    );
    drawBoothFrame(ctx, {
      occupants,
      hoverHotspot,
      tvOn,
      nowMs,
      reducedMotion,
    });
    ctx.restore();
  }

  function worldFromPointer(ev: PointerEvent): { x: number; y: number } | null {
    if (!canvasEl || !layout) return null;
    const rect = canvasEl.getBoundingClientRect();
    return screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top, layout);
  }

  function onPointerMove(ev: PointerEvent) {
    const world = worldFromPointer(ev);
    hoverHotspot = world ? hitTestBoothHotspot(world.x, world.y) : null;
  }

  function onPointerUp(ev: PointerEvent) {
    const world = worldFromPointer(ev);
    const id = world ? hitTestBoothHotspot(world.x, world.y) : null;
    if (id) onHotspot(id);
  }

  $effect(() => {
    attachMediaStream(tvEl, tvStream);
  });

  $effect(() => {
    void occupants;
    void hoverHotspot;
    void tvOn;
    void nowMs;
    void layout;
    paint();
  });

  $effect(() => {
    if (reducedMotion || tvOn) return;
    let raf = 0;
    const tick = (t: number) => {
      nowMs = t;
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  });

  onMount(() => {
    reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    applyLayout();
    const ro = new ResizeObserver(() => applyLayout());
    if (frameEl) ro.observe(frameEl);
    const mq = window.matchMedia(ROOM_SHORT_LANDSCAPE_MQ);
    mq.addEventListener("change", applyLayout);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", applyLayout);
    };
  });
</script>

<div class="booth-stage">
  <div class="booth-frame" bind:this={frameEl}>
  <div
    class={["booth-wrap", overlayOpen && "booth-wrap--chrome"].filter(Boolean).join(" ")}
    bind:this={wrapEl}
  >
    <canvas
      bind:this={canvasEl}
      class="booth-canvas"
      aria-label="包廂內景"
      onpointermove={onPointerMove}
      onpointerleave={() => (hoverHotspot = null)}
      onpointerup={onPointerUp}
    ></canvas>
    {#if overlay}
      <video
        bind:this={tvEl}
        class={["booth-tv", !tvOn && "booth-tv--off"].filter(Boolean).join(" ")}
        style:left={`${overlay.left}px`}
        style:top={`${overlay.top}px`}
        style:width={`${overlay.width}px`}
        style:height={`${overlay.height}px`}
        autoplay
        playsinline
        aria-label="包廂電視"
      ></video>
    {/if}
    {@render children?.()}
  </div>
  </div>
  {#if showTools}
  <nav class="booth-hotspots" aria-label="包廂捷徑">
    {#each GO_BOOTH_HOTSPOTS.filter((s) => s.id === "tv" || s.id === "shelf" || (s.id === "door" && inviteEnabled)) as spot (spot.id)}
      <button type="button" class="pixel-btn" onclick={() => onHotspot(spot.id)}>
        {spot.label}
      </button>
    {/each}
  </nav>
  {/if}
</div>

<style>
  .booth-stage {
    width: 100%;
    max-width: 640px;
    margin-inline: auto;
    min-width: 0;
  }
  .booth-frame {
    position: relative;
    width: 100%;
  }
  .booth-wrap {
    position: relative;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .booth-wrap--chrome {
    z-index: 4;
  }
  .booth-canvas {
    display: block;
    width: 100%;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    box-shadow: var(--pixel-shadow);
    cursor: pointer;
    touch-action: manipulation;
    background: rgb(var(--card));
  }
  .booth-tv {
    position: absolute;
    object-fit: cover;
    border: 0;
    background: #121018;
    pointer-events: none;
  }
  .booth-tv--off {
    opacity: 0;
  }
  .booth-hotspots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.4rem 0 0;
  }
  .booth-hotspots .pixel-btn {
    flex: 0 0 auto;
    min-height: 44px;
    font-size: 0.78rem;
    padding: 0.35rem 0.55rem;
  }
  @media (orientation: landscape) and (max-height: 560px) {
    .booth-stage {
      height: 100%;
      max-width: none;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .booth-frame {
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      display: flex;
      align-items: flex-start;
      justify-content: flex-start;
    }
    .booth-wrap {
      width: auto;
      max-width: 100%;
      max-height: 100%;
      margin: 0;
    }
    .booth-hotspots {
      display: none;
    }
  }
</style>
