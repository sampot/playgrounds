import {
  GO_LOBBY_HOTSPOTS,
  GO_LOBBY_WORLD,
  hitTestShopHotspot,
  rectsForHotspot,
  type ShopHotspotId,
} from "./goShopHotspots";
import {
  LOBBY_ENTRANCE,
  LOBBY_SPAWN,
  LOBBY_WALL_BOTTOM,
  LOBBY_WALL_SIDE,
  LOBBY_WALL_TOP,
  lobbyBlockingRects,
  type LobbyRect,
} from "./goLobbyLayout";

export const LOBBY_WALK_STORAGE_KEY = "pg_go_lobby_walk";
export const LOBBY_AVATAR_SESSION_KEY = "pg_go_lobby_avatar";
export const LOBBY_WALK_ARRIVAL_RADIUS = 6;

export type Vec2 = { x: number; y: number };

export type WalkInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export type LobbyCollisionGrid = {
  solids: readonly LobbyRect[];
};

export const LOBBY_AVATAR_RADIUS = 6;

export const LOBBY_WALK_SPEED = 72; // world px / second
export const LOBBY_WALK_FRAME_MS = 140;
export const LOBBY_WALK_FRAMES = 4;

export type WalkFacing = "down" | "up" | "left" | "right";

export function walkInputActive(input: WalkInput): boolean {
  return input.up || input.down || input.left || input.right;
}

/** Vertical wins on diagonals so tap-to-move toward the counter faces up. */
export function facingFromWalkInput(
  input: WalkInput,
  prev: WalkFacing = "down"
): WalkFacing {
  if (input.down && !input.up) return "down";
  if (input.up && !input.down) return "up";
  if (input.right && !input.left) return "right";
  if (input.left && !input.right) return "left";
  return prev;
}

export function walkAnimFrame(elapsedMs: number, walking: boolean): number {
  if (!walking) return 0;
  const n = Math.floor(elapsedMs / LOBBY_WALK_FRAME_MS);
  return ((n % LOBBY_WALK_FRAMES) + LOBBY_WALK_FRAMES) % LOBBY_WALK_FRAMES;
}

export function readLobbyWalkPreference(
  storage: Pick<Storage, "getItem"> | null | undefined,
  prefersReducedMotion: boolean
): boolean {
  if (prefersReducedMotion) return false;
  if (!storage) return true;
  const raw = storage.getItem(LOBBY_WALK_STORAGE_KEY);
  if (raw === "off") return false;
  if (raw === "on") return true;
  return true;
}

export function writeLobbyWalkPreference(
  storage: Pick<Storage, "setItem">,
  enabled: boolean
): void {
  storage.setItem(LOBBY_WALK_STORAGE_KEY, enabled ? "on" : "off");
}

/** Default spawn in the south aisle. */
export function defaultLobbyAvatarPosition(): Vec2 {
  return { ...LOBBY_SPAWN };
}

/**
 * Indoor lobby collision: outer walls (center door gap) + furniture.
 * Pixel AABB vs circle so tile rounding cannot swallow the counter aisle.
 */
export function createLobbyCollisionGrid(): LobbyCollisionGrid {
  const { width, height } = GO_LOBBY_WORLD;
  const solids: LobbyRect[] = [
    { x: 0, y: 0, w: width, h: LOBBY_WALL_TOP },
    { x: 0, y: 0, w: LOBBY_WALL_SIDE, h: height },
    { x: width - LOBBY_WALL_SIDE, y: 0, w: LOBBY_WALL_SIDE, h: height },
    {
      x: 0,
      y: height - LOBBY_WALL_BOTTOM,
      w: LOBBY_ENTRANCE.x,
      h: LOBBY_WALL_BOTTOM,
    },
    {
      x: LOBBY_ENTRANCE.x + LOBBY_ENTRANCE.w,
      y: height - LOBBY_WALL_BOTTOM,
      w: width - (LOBBY_ENTRANCE.x + LOBBY_ENTRANCE.w),
      h: LOBBY_WALL_BOTTOM,
    },
    ...lobbyBlockingRects(),
  ];
  return { solids };
}

function circleHitsRect(
  cx: number,
  cy: number,
  radius: number,
  rect: LobbyRect
): boolean {
  const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

export function isCircleBlocked(
  x: number,
  y: number,
  radius: number,
  grid: LobbyCollisionGrid
): boolean {
  if (
    x - radius < 0 ||
    y - radius < 0 ||
    x + radius > GO_LOBBY_WORLD.width ||
    y + radius > GO_LOBBY_WORLD.height
  ) {
    return true;
  }
  for (const solid of grid.solids) {
    if (circleHitsRect(x, y, radius, solid)) return true;
  }
  return false;
}

export function clampAvatarToWorld(pos: Vec2): Vec2 {
  const r = LOBBY_AVATAR_RADIUS;
  return {
    x: Math.min(GO_LOBBY_WORLD.width - r, Math.max(r, pos.x)),
    y: Math.min(GO_LOBBY_WORLD.height - r, Math.max(r, pos.y)),
  };
}

function walkDelta(
  input: WalkInput,
  deltaSec: number,
  speed: number
): Vec2 {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx === 0 && dy === 0) return { x: 0, y: 0 };
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: (dx / len) * speed * deltaSec,
    y: (dy / len) * speed * deltaSec,
  };
}

export function moveAvatarWithCollision(
  pos: Vec2,
  input: WalkInput,
  deltaSec: number,
  grid: LobbyCollisionGrid,
  speed: number = LOBBY_WALK_SPEED
): Vec2 {
  const delta = walkDelta(input, deltaSec, speed);
  if (delta.x === 0 && delta.y === 0) return pos;

  let next = pos;
  const xTry = clampAvatarToWorld({ x: pos.x + delta.x, y: pos.y });
  if (!isCircleBlocked(xTry.x, xTry.y, LOBBY_AVATAR_RADIUS, grid)) {
    next = { x: xTry.x, y: next.y };
  }
  const yTry = clampAvatarToWorld({ x: next.x, y: next.y + delta.y });
  if (!isCircleBlocked(yTry.x, yTry.y, LOBBY_AVATAR_RADIUS, grid)) {
    next = { x: next.x, y: yTry.y };
  }
  return next;
}

function hotspotTouchedByCircle(
  x: number,
  y: number,
  radius: number
): ShopHotspotId | null {
  let best: { id: ShopHotspotId; d: number } | null = null;
  for (const spot of GO_LOBBY_HOTSPOTS) {
    for (const rect of rectsForHotspot(spot)) {
      if (!circleHitsRect(x, y, radius, rect)) continue;
      const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
      const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
      const d = Math.hypot(x - nx, y - ny);
      if (!best || d < best.d) best = { id: spot.id, d };
    }
  }
  return best?.id ?? null;
}

export type WalkBumpResult = {
  activate: ShopHotspotId | null;
  contact: ShopHotspotId | null;
};

/**
 * Keyboard walk: bumping an interactable (attempted move overlaps it) opens it.
 * Same contact is ignored until the player walks off.
 */
export function resolveWalkBump(args: {
  from: Vec2;
  input: WalkInput;
  alreadyContact: ShopHotspotId | null;
  deltaSec?: number;
  speed?: number;
}): WalkBumpResult {
  if (!walkInputActive(args.input)) {
    return { activate: null, contact: null };
  }
  const delta = walkDelta(
    args.input,
    args.deltaSec ?? 1 / 60,
    args.speed ?? LOBBY_WALK_SPEED
  );
  const attempted = clampAvatarToWorld({
    x: args.from.x + delta.x,
    y: args.from.y + delta.y,
  });
  let contact = hotspotTouchedByCircle(
    attempted.x,
    attempted.y,
    LOBBY_AVATAR_RADIUS
  );
  if (!contact) {
    const topWall: LobbyRect = {
      x: 0,
      y: 0,
      w: GO_LOBBY_WORLD.width,
      h: LOBBY_WALL_TOP,
    };
    if (circleHitsRect(attempted.x, attempted.y, LOBBY_AVATAR_RADIUS, topWall)) {
      contact = hitTestShopHotspot(args.from.x, LOBBY_WALL_TOP / 2);
    }
  }
  if (!contact) return { activate: null, contact: null };
  if (contact === args.alreadyContact) {
    return { activate: null, contact };
  }
  return { activate: contact, contact };
}

export function normalizeWalkInput(keys: Partial<WalkInput>): WalkInput {
  return {
    up: !!keys.up,
    down: !!keys.down,
    left: !!keys.left,
    right: !!keys.right,
  };
}

export function readLobbyAvatarPosition(
  storage: Pick<Storage, "getItem"> | null | undefined
): Vec2 | null {
  if (!storage) return null;
  const raw = storage.getItem(LOBBY_AVATAR_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Vec2).x === "number" &&
      typeof (parsed as Vec2).y === "number"
    ) {
      return clampAvatarToWorld(parsed as Vec2);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeLobbyAvatarPosition(
  storage: Pick<Storage, "setItem">,
  pos: Vec2
): void {
  storage.setItem(LOBBY_AVATAR_SESSION_KEY, JSON.stringify(clampAvatarToWorld(pos)));
}

/** Tap-to-move: derive keyboard-style input toward a world target. */
export function walkInputToward(from: Vec2, to: Vec2): WalkInput {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) <= LOBBY_WALK_ARRIVAL_RADIUS) {
    return { up: false, down: false, left: false, right: false };
  }
  return {
    up: dy < -0.5,
    down: dy > 0.5,
    left: dx < -0.5,
    right: dx > 0.5,
  };
}

export function hasWalkArrived(from: Vec2, to: Vec2): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= LOBBY_WALK_ARRIVAL_RADIUS;
}

export type LobbyTapResult =
  | { type: "activate"; id: ShopHotspotId }
  | { type: "walk"; target: Vec2 }
  | { type: "place"; target: Vec2 };

/** Tap a hotspot to interact with that object; tap floor to walk or place. */
export function resolveLobbyTap(args: {
  walkEnabled: boolean;
  world: Vec2;
  tappedHotspot: ShopHotspotId | null;
}): LobbyTapResult {
  if (args.tappedHotspot) return { type: "activate", id: args.tappedHotspot };
  if (args.walkEnabled) return { type: "walk", target: args.world };
  return { type: "place", target: args.world };
}

export function walkInputFromKey(
  input: WalkInput,
  key: string,
  pressed: boolean
): WalkInput | null {
  const next = { ...input };
  if (key === "ArrowUp" || key === "w" || key === "W") next.up = pressed;
  else if (key === "ArrowDown" || key === "s" || key === "S") next.down = pressed;
  else if (key === "ArrowLeft" || key === "a" || key === "A") next.left = pressed;
  else if (key === "ArrowRight" || key === "d" || key === "D") next.right = pressed;
  else return null;
  return next;
}
