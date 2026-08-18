/** Shared indoor-arcade geometry: draw, hit-test, and collision stay aligned. */

export type LobbyRect = { x: number; y: number; w: number; h: number };

export const LOBBY_WALL_TOP = 24;
export const LOBBY_WALL_SIDE = 10;
export const LOBBY_WALL_BOTTOM = 10;

/** Storefront sign on the back wall (must stay clear of bulletin / ad). */
export const LOBBY_SIGN: LobbyRect = { x: 96, y: 4, w: 128, h: 14 };

/** Service counter, left of the back wall. Approach from the south. */
export const LOBBY_BOSS: LobbyRect = { x: 16, y: 32, w: 80, h: 40 };

/** Posters mounted on the back wall, left of the sign. */
export const LOBBY_BULLETIN: LobbyRect = { x: 12, y: 3, w: 76, h: 18 };

/** Small information kiosk beside the counter. */
export const LOBBY_HELP: LobbyRect = { x: 112, y: 40, w: 36, h: 32 };

/** Neon board on the back-right wall. */
export const LOBBY_AD: LobbyRect = { x: 228, y: 4, w: 76, h: 28 };

/** Staff door on the right wall. */
export const LOBBY_STORAGE: LobbyRect = { x: 272, y: 104, w: 32, h: 56 };

/** Two clusters with a center aisle so the counter is approachable from spawn. */
export const LOBBY_CABINETS: readonly LobbyRect[] = [
  { x: 16, y: 96, w: 28, h: 44 },
  { x: 48, y: 96, w: 28, h: 44 },
  { x: 144, y: 96, w: 28, h: 44 },
  { x: 176, y: 96, w: 28, h: 44 },
];

export const LOBBY_ENTRANCE: LobbyRect = { x: 112, y: 184, w: 96, h: 16 };

/** Center of the south aisle, in front of the machines. */
export const LOBBY_SPAWN = { x: 160, y: 168 };

export function unionRects(rects: readonly LobbyRect[]): LobbyRect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export const LOBBY_CABINET_ZONE: LobbyRect = unionRects(LOBBY_CABINETS);

/** Solid props the avatar cannot walk through (wall posters sit in the wall band). */
export function lobbyBlockingRects(): LobbyRect[] {
  return [LOBBY_BOSS, LOBBY_HELP, LOBBY_STORAGE, ...LOBBY_CABINETS];
}
