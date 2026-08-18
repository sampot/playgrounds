<script lang="ts">
  import { onMount } from "svelte";
  import {
    drawLobbyFrame,
    computeLobbyCanvasLayout,
    screenToWorld,
    type CanvasLayout,
  } from "$lib/goShopCanvas";
  import {
    hitTestShopHotspot,
    getShopHotspot,
    hotspotCenter,
    type ShopHotspotId,
  } from "$lib/goShopHotspots";
  import {
    createLobbyCollisionGrid,
    defaultLobbyAvatarPosition,
    moveAvatarWithCollision,
    readLobbyWalkPreference,
    writeLobbyWalkPreference,
    readLobbyAvatarPosition,
    writeLobbyAvatarPosition,
    clampAvatarToWorld,
    resolveLobbyTap,
    walkInputFromKey,
    facingFromWalkInput,
    walkInputActive,
    walkAnimFrame,
    resolveWalkBump,
    type WalkInput,
    type WalkFacing,
    type Vec2,
  } from "$lib/goShopWalk";
  import { followLobbyPath, planLobbyWalk } from "$lib/goLobbyPath";
  import GoHelpDesk from "$lib/GoHelpDesk.svelte";
  import GoCabinetOverlay from "$lib/GoCabinetOverlay.svelte";

  let {
    onHotspot,
    helpDeskOpen = $bindable(false),
    cabinetOpen = $bindable(false),
  }: {
    onHotspot: (id: ShopHotspotId) => void;
    helpDeskOpen?: boolean;
    cabinetOpen?: boolean;
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let layout = $state<CanvasLayout | null>(null);
  let avatar = $state<Vec2>(defaultLobbyAvatarPosition());
  let walkEnabled = $state(true);
  let prefersReducedMotion = $state(false);
  let hoverHotspot = $state<ShopHotspotId | null>(null);
  let input = $state<WalkInput>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  let walkPath: Vec2[] = [];
  let facing = $state<WalkFacing>("down");
  let walking = $state(false);
  let walkFrame = $state(0);
  let walkClock = 0;
  let bumpContact: ShopHotspotId | null = null;

  let overlayOpen = $derived(helpDeskOpen || cabinetOpen);
  const collisionGrid = createLobbyCollisionGrid();
  let raf = 0;
  let lastFrame = 0;

  function applyLayout() {
    if (!containerEl || !canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    layout = computeLobbyCanvasLayout(containerEl.clientWidth, dpr);
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
    ctx.setTransform(layout.dpr * layout.scale, 0, 0, layout.dpr * layout.scale, 0, 0);
    drawLobbyFrame(ctx, {
      avatar,
      nearHotspot: hoverHotspot,
      hoverHotspot,
      facing,
      walking,
      walkFrame,
    });
    ctx.restore();
  }

  function frame(now: number) {
    if (!lastFrame) lastFrame = now;
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (walkEnabled && !overlayOpen) {
      let activeInput = input;
      if (walkPath.length > 0) {
        const step = followLobbyPath(avatar, walkPath);
        walkPath = step.path;
        activeInput = step.input;
        if (step.arrived) walkPath = [];
      }
      const moving = walkInputActive(activeInput);
      walking = moving;
      if (moving) {
        facing = facingFromWalkInput(activeInput, facing);
        walkClock += delta * 1000;
      } else {
        walkClock = 0;
      }
      walkFrame = walkAnimFrame(walkClock, moving);
      const from = avatar;
      avatar = moveAvatarWithCollision(avatar, activeInput, delta, collisionGrid);
      if (!walkPath.length && moving) {
        const bump = resolveWalkBump({
          from,
          input: activeInput,
          alreadyContact: bumpContact,
          deltaSec: delta,
        });
        bumpContact = bump.contact;
        if (bump.activate) activateHotspot(bump.activate);
      } else if (!moving) {
        bumpContact = null;
      }
    } else {
      walking = false;
      walkFrame = 0;
      bumpContact = null;
    }
    paint();
    raf = requestAnimationFrame(frame);
  }

  function pointerHotspot(clientX: number, clientY: number): ShopHotspotId | null {
    if (!canvasEl || !layout) return null;
    const rect = canvasEl.getBoundingClientRect();
    const world = screenToWorld(clientX - rect.left, clientY - rect.top, layout);
    return hitTestShopHotspot(world.x, world.y);
  }

  function handlePointerMove(event: PointerEvent) {
    hoverHotspot = pointerHotspot(event.clientX, event.clientY);
    if (!walkEnabled) paint();
  }

  function handlePointerLeave() {
    hoverHotspot = null;
    if (!walkEnabled) paint();
  }

  function activateHotspot(id: ShopHotspotId) {
    onHotspot(id);
  }

  function handlePointerDown(event: PointerEvent) {
    if (overlayOpen) return;
    if (!layout || !canvasEl) return;
    canvasEl.focus({ preventScroll: true });
    const rect = canvasEl.getBoundingClientRect();
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, layout);
    hoverHotspot = hitTestShopHotspot(world.x, world.y);
    const action = resolveLobbyTap({
      walkEnabled,
      world,
      tappedHotspot: hoverHotspot,
    });
    if (action.type === "activate") {
      activateHotspot(action.id);
      return;
    }
    if (action.type === "walk") {
      walkPath = planLobbyWalk(avatar, clampAvatarToWorld(action.target), collisionGrid);
      return;
    }
    avatar = clampAvatarToWorld(action.target);
    paint();
  }

  function isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (overlayOpen) return;
    if (isTextEntryTarget(event.target)) return;
    const next = walkInputFromKey(input, event.key, true);
    if (next) {
      event.preventDefault();
      input = next;
      walkPath = [];
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) return;
    const next = walkInputFromKey(input, event.key, false);
    if (next) input = next;
  }

  function toggleWalk() {
    walkEnabled = !walkEnabled;
    writeLobbyWalkPreference(localStorage, walkEnabled);
    paint();
  }

  /** A11y nav: move avatar near hotspot then activate. */
  export function focusHotspot(id: ShopHotspotId) {
    const spot = getShopHotspot(id);
    if (!spot) return;
    const c = hotspotCenter(spot);
    avatar = { x: c.x, y: Math.min(188, c.y + spot.h / 2 + 10) };
    paint();
    activateHotspot(id);
  }

  onMount(() => {
    prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    walkEnabled = readLobbyWalkPreference(localStorage, prefersReducedMotion);
    avatar =
      readLobbyAvatarPosition(sessionStorage) ?? defaultLobbyAvatarPosition();

    applyLayout();
    paint();
    raf = requestAnimationFrame(frame);

    const ro = new ResizeObserver(() => {
      applyLayout();
      paint();
    });
    if (containerEl) ro.observe(containerEl);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      writeLobbyAvatarPosition(sessionStorage, avatar);
    };
  });

  $effect(() => {
    if (typeof sessionStorage === "undefined") return;
    writeLobbyAvatarPosition(sessionStorage, avatar);
  });

  $effect(() => {
    if (!overlayOpen) return;
    walkPath = [];
    input = { up: false, down: false, left: false, right: false };
  });
</script>

<section class="go-lobby" aria-label="山姆鍋遊樂場大廳">
  <div class="go-lobby-toolbar">
    <p class="go-lobby-lead pixel-text">
      {walkEnabled
        ? "點地板走動；點物件互動。方向鍵碰到櫃檯、機台或詢問處即開啟。"
        : "點大廳熱點互動，或改走動模式。"}
    </p>
    <button
      type="button"
      class="go-lobby-walk-toggle pixel-btn"
      onclick={toggleWalk}
      aria-pressed={walkEnabled}
    >
      {walkEnabled ? "改點選" : "開始走動"}
    </button>
  </div>
  <div class="go-lobby-canvas-wrap">
    <div class="go-lobby-stage" class:go-lobby-stage--chrome={overlayOpen} bind:this={containerEl}>
      <canvas
        bind:this={canvasEl}
        class="go-lobby-canvas"
        tabindex="0"
        aria-label="遊樂場大廳場景"
        onpointermove={handlePointerMove}
        onpointerleave={handlePointerLeave}
        onpointerdown={handlePointerDown}
      ></canvas>
      <GoHelpDesk bind:open={helpDeskOpen} />
      <GoCabinetOverlay bind:open={cabinetOpen} />
    </div>
  </div>
</section>

<style>
  .go-lobby {
    margin: 0 0 1rem;
  }
  .go-lobby-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.45rem;
  }
  .go-lobby-lead {
    margin: 0;
    font-size: 0.82rem;
    color: color-mix(in oklab, rgb(var(--ink)) 82%, transparent);
    flex: 1 1 12rem;
  }
  .go-lobby-walk-toggle {
    min-height: 44px;
    flex: 0 0 auto;
  }
  .go-lobby-canvas-wrap {
    width: 100%;
  }
  .go-lobby-stage {
    position: relative;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .go-lobby-stage--chrome {
    z-index: 4;
  }
  .go-lobby-canvas {
    display: block;
    width: 100%;
    border: var(--pixel-edge) solid rgb(var(--ink));
    border-radius: var(--radius);
    box-shadow: var(--pixel-shadow);
    cursor: pointer;
    touch-action: manipulation;
    background: rgb(var(--card));
  }
  .go-lobby-canvas:focus-visible {
    outline: 2px solid rgb(var(--accent));
    outline-offset: 2px;
  }
</style>
