/** Static booth interior geometry. Not the walkable lobby map. */

export type BoothRect = { x: number; y: number; w: number; h: number };

/** Same 320×200 as the lobby so `/room` can be a full canvas stage. */
export const GO_BOOTH_WORLD = {
  width: 320,
  height: 200,
} as const;

export const BOOTH_WALL_TOP = 12;
export const BOOTH_WALL_SIDE = 8;
export const BOOTH_WALL_BOTTOM = 8;

/** TV bezel on the back wall — largest prop. */
export const BOOTH_TV: BoothRect = { x: 64, y: 10, w: 192, h: 102 };

/** Inner screen hole — DOM `<video>` overlays this via worldToScreen. */
export const BOOTH_TV_SCREEN: BoothRect = { x: 78, y: 22, w: 164, h: 76 };

/** Door on the left wall — invite, not a giant QR. */
export const BOOTH_DOOR: BoothRect = { x: 8, y: 118, w: 32, h: 56 };

/** Share shelf on the right wall. */
export const BOOTH_SHELF: BoothRect = { x: 280, y: 108, w: 32, h: 60 };

/** House ad posters on the back wall (decorative; not furniture hotspots). */
export const BOOTH_AD_LEFT: BoothRect = { x: 12, y: 24, w: 44, h: 56 };
export const BOOTH_AD_RIGHT: BoothRect = { x: 264, y: 24, w: 44, h: 56 };

/** Six cushions in front of the TV (soft cap). */
export const BOOTH_SEATS: readonly BoothRect[] = [
  { x: 40, y: 168, w: 36, h: 20 },
  { x: 80, y: 168, w: 36, h: 20 },
  { x: 120, y: 168, w: 36, h: 20 },
  { x: 164, y: 168, w: 36, h: 20 },
  { x: 204, y: 168, w: 36, h: 20 },
  { x: 244, y: 168, w: 36, h: 20 },
];

export function boothSeatCenter(index: number): { x: number; y: number } {
  const seat = BOOTH_SEATS[index];
  if (!seat) return { x: 160, y: 178 };
  return { x: seat.x + seat.w / 2, y: seat.y + seat.h / 2 };
}
