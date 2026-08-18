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
    lobbyPromptHotspot,
    type ShopHotspotId,
  } from "$lib/goShopHotspots";
  import {
    createLobbyCollisionGrid,
    defaultLobbyAvatarPosition,
    moveAvatarWithCollision,
    readLobbyWalkPreference,
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
  import {
    hitTestLobbyCabinetIndex,
    nearestLobbyCabinetIndex,
    cabinetStandPoint,
    consumeLobbyReturnStand,
  } from "$lib/goLobbyCabinets";
  import type { GoCatalogEntry } from "$lib/goCatalog";
  import {
    getLobbySfxPlayer,
    shouldPlayFootstep,
    type LobbySfxPlayer,
  } from "$lib/goLobbySfx";
  import type { GoBulletin } from "$lib/goBulletin";
  import GoHelpDesk from "$lib/GoHelpDesk.svelte";
  import GoCabinetOverlay from "$lib/GoCabinetOverlay.svelte";
  import GoShopDialog from "$lib/GoShopDialog.svelte";
  import GoBulletinBoard from "$lib/GoBulletinBoard.svelte";

  let {
    onHotspot,
    helpDeskOpen = $bindable(false),
    cabinetOpen = $bindable(false),
    bossOpen = $bindable(false),
    bulletinOpen = $bindable(false),
    cabinetTitles = [],
    floorGames = [],
    onReshuffleCabinets,
    bulletins = [],
    onBulletinDismiss,
    onBossChoose,
  }: {
    onHotspot: (
      id: ShopHotspotId,
      detail?: { cabinetIndex?: number | null }
    ) => void;
    helpDeskOpen?: boolean;
    cabinetOpen?: boolean;
    bossOpen?: boolean;
    bulletinOpen?: boolean;
    cabinetTitles?: readonly string[];
    floorGames?: readonly GoCatalogEntry[];
    onReshuffleCabinets?: () => void;
    bulletins?: GoBulletin[];
    onBulletinDismiss?: (bulletin: GoBulletin) => void;
    onBossChoose?: (choice: "banter" | "cabinets" | "help") => void;
  } = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let layout = $state<CanvasLayout | null>(null);
  let avatar = $state<Vec2>(defaultLobbyAvatarPosition());
  let walkEnabled = $state(true);
  let prefersReducedMotion = $state(false);
  let hoverHotspot = $state<ShopHotspotId | null>(null);
  let hoverCabinetIndex = $state<number | null>(null);
  let input = $state<WalkInput>({
    up: false,
    down: false,
    left: false,
    right: false,
  });
  let walkPath: Vec2[] = [];
  let pendingCabinetIndex: number | null = null;
  let facing = $state<WalkFacing>("down");
  let walking = $state(false);
  let walkFrame = $state(0);
  let walkClock = 0;
  let bumpContact: ShopHotspotId | null = null;
  let sfx: LobbySfxPlayer | null = null;
  let prevWalkFrame = 0;

  let overlayOpen = $derived(
    helpDeskOpen || cabinetOpen || bossOpen || bulletinOpen
  );
  const collisionGrid = createLobbyCollisionGrid();
  let raf = 0;
  let lastFrame = 0;
  let attractNow = 0;

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
    const prompt = lobbyPromptHotspot({ avatar, hover: hoverHotspot });
    drawLobbyFrame(ctx, {
      avatar,
      nearHotspot: prompt,
      hoverHotspot,
      facing,
      walking,
      walkFrame,
      sfxEnabled: sfx?.isEnabled() ?? true,
      nowMs: prefersReducedMotion ? 0 : attractNow,
      cabinetTitles,
      activeCabinetIndex:
        hoverCabinetIndex ??
        (prompt === "cabinet" ? nearestLobbyCabinetIndex(avatar.x, avatar.y) : null),
    });
    ctx.restore();
  }

  function frame(now: number) {
    if (!lastFrame) lastFrame = now;
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    attractNow = now;

    if (walkEnabled && !overlayOpen) {
      let activeInput = input;
      let arrivedPlay: number | null = null;
      if (walkPath.length > 0) {
        const step = followLobbyPath(avatar, walkPath);
        walkPath = step.path;
        activeInput = step.input;
        if (step.arrived) {
          walkPath = [];
          arrivedPlay = pendingCabinetIndex;
          pendingCabinetIndex = null;
        }
      }
      const moving = walkInputActive(activeInput);
      const wasWalking = walking;
      walking = moving;
      if (moving) {
        facing = facingFromWalkInput(activeInput, facing);
        walkClock += delta * 1000;
      } else {
        walkClock = 0;
      }
      walkFrame = walkAnimFrame(walkClock, moving);
      if (shouldPlayFootstep(prevWalkFrame, walkFrame, moving, wasWalking)) {
        sfx?.playStep();
      }
      prevWalkFrame = walkFrame;
      const from = avatar;
      avatar = moveAvatarWithCollision(avatar, activeInput, delta, collisionGrid);
      if (arrivedPlay != null) {
        bumpContact = null;
        activateHotspot("cabinet", arrivedPlay);
      } else if (!walkPath.length && moving) {
        const bump = resolveWalkBump({
          from,
          input: activeInput,
          alreadyContact: bumpContact,
          deltaSec: delta,
        });
        bumpContact = bump.contact;
        if (bump.activate === "cabinet") {
          activateHotspot("cabinet", nearestLobbyCabinetIndex(from.x, from.y));
        } else if (bump.activate) {
          activateHotspot(bump.activate);
        }
      } else if (!moving) {
        bumpContact = null;
      }
    } else {
      walking = false;
      walkFrame = 0;
      prevWalkFrame = 0;
      bumpContact = null;
    }
    paint();
    raf = requestAnimationFrame(frame);
  }

  function pointerWorld(clientX: number, clientY: number): Vec2 | null {
    if (!canvasEl || !layout) return null;
    const rect = canvasEl.getBoundingClientRect();
    return screenToWorld(clientX - rect.left, clientY - rect.top, layout);
  }

  function handlePointerMove(event: PointerEvent) {
    const world = pointerWorld(event.clientX, event.clientY);
    hoverHotspot = world ? hitTestShopHotspot(world.x, world.y) : null;
    hoverCabinetIndex =
      hoverHotspot === "cabinet" && world
        ? hitTestLobbyCabinetIndex(world.x, world.y)
        : null;
    if (!walkEnabled) paint();
  }

  function handlePointerLeave() {
    hoverHotspot = null;
    hoverCabinetIndex = null;
    if (!walkEnabled) paint();
  }

  function activateHotspot(id: ShopHotspotId, cabinetIndex: number | null = null) {
    onHotspot(id, { cabinetIndex });
  }

  function handlePointerDown(event: PointerEvent) {
    sfx?.unlock();
    if (overlayOpen) return;
    if (!layout || !canvasEl) return;
    canvasEl.focus({ preventScroll: true });
    const rect = canvasEl.getBoundingClientRect();
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, layout);
    hoverHotspot = hitTestShopHotspot(world.x, world.y);
    const cabinetIndex =
      hoverHotspot === "cabinet" ? hitTestLobbyCabinetIndex(world.x, world.y) : null;
    const action = resolveLobbyTap({
      walkEnabled,
      world,
      tappedHotspot: hoverHotspot,
      from: avatar,
      cabinetIndex,
      cabinetStand: cabinetIndex != null ? cabinetStandPoint(cabinetIndex) : null,
    });
    if (action.type === "activate") {
      pendingCabinetIndex = null;
      if (action.id === "cabinet") {
        activateHotspot("cabinet", cabinetIndex);
      } else {
        activateHotspot(action.id);
      }
      return;
    }
    if (action.type === "walk-then-activate") {
      pendingCabinetIndex = action.cabinetIndex;
      walkPath = planLobbyWalk(avatar, clampAvatarToWorld(action.target), collisionGrid);
      return;
    }
    if (action.type === "walk") {
      pendingCabinetIndex = null;
      walkPath = planLobbyWalk(avatar, clampAvatarToWorld(action.target), collisionGrid);
      return;
    }
    pendingCabinetIndex = null;
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
      sfx?.unlock();
      input = next;
      walkPath = [];
      pendingCabinetIndex = null;
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (isTextEntryTarget(event.target)) return;
    const next = walkInputFromKey(input, event.key, false);
    if (next) input = next;
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
    sfx = getLobbySfxPlayer();
    walkEnabled = readLobbyWalkPreference(localStorage, prefersReducedMotion);
    avatar =
      consumeLobbyReturnStand(sessionStorage) ??
      readLobbyAvatarPosition(sessionStorage) ??
      defaultLobbyAvatarPosition();

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
    pendingCabinetIndex = null;
    input = { up: false, down: false, left: false, right: false };
  });
</script>

<section class="go-lobby" aria-label="山姆鍋遊樂場大廳">
  <div class="go-lobby-toolbar">
    <p class="go-lobby-lead pixel-text">
      {walkEnabled
        ? "點地板走動；點物件互動。點右上 PLAY 可開關音效。"
        : "點大廳熱點互動。"}
    </p>
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
      <GoCabinetOverlay
        bind:open={cabinetOpen}
        {floorGames}
        onReshuffle={onReshuffleCabinets}
      />
      <GoShopDialog bind:open={bossOpen} onChoose={onBossChoose ?? (() => {})} />
      <GoBulletinBoard
        bind:open={bulletinOpen}
        {bulletins}
        onDismiss={onBulletinDismiss ?? (() => {})}
      />
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
