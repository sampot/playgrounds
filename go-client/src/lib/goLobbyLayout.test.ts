import { describe, expect, it } from "vitest";
import { hitTestShopHotspot } from "./goShopHotspots";
import {
  createLobbyCollisionGrid,
  defaultLobbyAvatarPosition,
  isCircleBlocked,
} from "./goShopWalk";
import {
  LOBBY_AD,
  LOBBY_BOSS,
  LOBBY_BULLETIN,
  LOBBY_CABINETS,
  LOBBY_CABINET_ZONE,
  LOBBY_ROOM,
  LOBBY_SIGN,
  LOBBY_SPAWN,
  LOBBY_STORAGE,
  lobbyBlockingRects,
  unionRects,
} from "./goLobbyLayout";

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

describe("goLobbyLayout", () => {
  it("unions cabinet machines into one zone", () => {
    expect(unionRects(LOBBY_CABINETS)).toEqual(LOBBY_CABINET_ZONE);
    expect(LOBBY_CABINETS.length).toBe(4);
    expect(LOBBY_CABINET_ZONE.w).toBeGreaterThan(100);
    expect(LOBBY_CABINET_ZONE.y).toBeGreaterThan(LOBBY_BOSS.y + LOBBY_BOSS.h);
  });

  it("keeps a walkable aisle south of the machines", () => {
    expect(hitTestShopHotspot(160, 160)).toBeNull();
    expect(hitTestShopHotspot(280, 180)).toBeNull();
    const grid = createLobbyCollisionGrid();
    expect(isCircleBlocked(160, 160, 6, grid)).toBe(false);
    expect(isCircleBlocked(LOBBY_SPAWN.x, LOBBY_SPAWN.y, 6, grid)).toBe(false);
  });

  it("leaves a walkable approach to the south face of the counter", () => {
    const standX = LOBBY_BOSS.x + LOBBY_BOSS.w / 2;
    const standY = LOBBY_BOSS.y + LOBBY_BOSS.h + 8;
    expect(hitTestShopHotspot(110, 120)).toBeNull();
    expect(hitTestShopHotspot(standX, standY)).toBeNull();
    const grid = createLobbyCollisionGrid();
    expect(isCircleBlocked(110, 120, 6, grid)).toBe(false);
    expect(isCircleBlocked(standX, standY, 6, grid)).toBe(false);
  });

  it("keeps a walkable approach west of the 包廂 door", () => {
    expect(rectsOverlap(LOBBY_ROOM, LOBBY_AD)).toBe(false);
    expect(rectsOverlap(LOBBY_ROOM, LOBBY_STORAGE)).toBe(false);
    expect(LOBBY_ROOM.x).toBe(LOBBY_STORAGE.x);
    expect(LOBBY_ROOM.w).toBe(LOBBY_STORAGE.w);
    expect(LOBBY_ROOM.y + LOBBY_ROOM.h).toBeLessThan(LOBBY_STORAGE.y);
    const grid = createLobbyCollisionGrid();
    expect(
      isCircleBlocked(LOBBY_ROOM.x + 8, LOBBY_ROOM.y + 8, 6, grid)
    ).toBe(true);
    expect(
      isCircleBlocked(LOBBY_ROOM.x - 8, LOBBY_ROOM.y + LOBBY_ROOM.h / 2, 6, grid)
    ).toBe(false);
  });

  it("blocks furniture, not a full-width counter slab", () => {
    const grid = createLobbyCollisionGrid();
    expect(isCircleBlocked(LOBBY_BOSS.x + 8, LOBBY_BOSS.y + 8, 6, grid)).toBe(
      true
    );
    expect(isCircleBlocked(120, 52, 6, grid)).toBe(false);
    expect(
      isCircleBlocked(LOBBY_STORAGE.x + 8, LOBBY_STORAGE.y + 8, 6, grid)
    ).toBe(true);
    expect(isCircleBlocked(200, 48, 6, grid)).toBe(false);
    expect(lobbyBlockingRects().some((r) => r.w >= 200)).toBe(false);
  });

  it("spawns in the entrance aisle", () => {
    const spawn = defaultLobbyAvatarPosition();
    expect(spawn).toEqual(LOBBY_SPAWN);
    expect(spawn.y).toBeGreaterThan(LOBBY_CABINET_ZONE.y + LOBBY_CABINET_ZONE.h);
  });

  it("keeps the wall sign clear of bulletin and ad", () => {
    expect(rectsOverlap(LOBBY_BULLETIN, LOBBY_SIGN)).toBe(false);
    expect(rectsOverlap(LOBBY_AD, LOBBY_SIGN)).toBe(false);
  });
});
