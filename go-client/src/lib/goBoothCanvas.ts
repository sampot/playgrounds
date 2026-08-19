import {
  BOOTH_AD_LEFT,
  BOOTH_AD_RIGHT,
  BOOTH_DOOR,
  BOOTH_SEATS,
  BOOTH_SHELF,
  BOOTH_TV,
  BOOTH_TV_SCREEN,
  BOOTH_WALL_BOTTOM,
  BOOTH_WALL_SIDE,
  BOOTH_WALL_TOP,
  GO_BOOTH_WORLD,
  boothSeatCenter,
  type BoothRect,
} from "./goBoothLayout";
import type { BoothHotspotId } from "./goBoothHotspots";
import {
  DEFAULT_LOBBY_COLORS,
  PLAYER_HAIR,
  PLAYER_HAIR_HL,
  type CanvasLayout,
  type LobbyCanvasColors,
  worldToScreen,
} from "./goShopCanvas";
import type { RoomOccupant } from "./goRoom";

const SKIN = "#f3c7a2";
const SKIN_SH = "#d9a57e";
const LINE = "#16121c";

export type BoothDrawState = {
  occupants: readonly RoomOccupant[];
  hoverHotspot: BoothHotspotId | null;
  tvOn?: boolean;
  colors?: Partial<LobbyCanvasColors>;
  nowMs?: number;
  reducedMotion?: boolean;
};

function mergeColors(partial?: Partial<LobbyCanvasColors>): LobbyCanvasColors {
  return { ...DEFAULT_LOBBY_COLORS, ...partial };
}

function px(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w: number = 1,
  h: number = 1
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Fit booth world into the box; preserve aspect. Height letterboxes landscape. */
export function computeBoothCanvasLayout(
  containerWidth: number,
  dpr: number = 1,
  containerHeight?: number
): CanvasLayout {
  const aspect = GO_BOOTH_WORLD.height / GO_BOOTH_WORLD.width;
  if (containerHeight != null && Number.isFinite(containerHeight) && containerHeight > 0) {
    const capW = Math.max(1, Math.min(containerWidth || 1, 640));
    const capH = Math.max(1, containerHeight);
    let cssWidth = capW;
    let cssHeight = cssWidth * aspect;
    if (cssHeight > capH) {
      cssHeight = capH;
      cssWidth = cssHeight / aspect;
    }
    cssWidth = Math.max(1, Math.round(cssWidth));
    cssHeight = Math.max(1, Math.round(cssWidth * aspect));
    if (cssHeight > capH) {
      cssHeight = Math.max(1, Math.round(capH));
      cssWidth = Math.max(1, Math.round(cssHeight / aspect));
    }
    return {
      cssWidth,
      cssHeight,
      dpr: Math.max(1, dpr),
      scale: cssWidth / GO_BOOTH_WORLD.width,
    };
  }
  const cssWidth = Math.max(280, Math.min(containerWidth, 640));
  const cssHeight = Math.round(cssWidth * aspect);
  const scale = cssWidth / GO_BOOTH_WORLD.width;
  return { cssWidth, cssHeight, dpr: Math.max(1, dpr), scale };
}

/** CSS box for the TV hole overlay, in the canvas wrap's coordinate space. */
export function boothTvOverlay(layout: CanvasLayout): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const origin = worldToScreen(BOOTH_TV_SCREEN.x, BOOTH_TV_SCREEN.y, layout);
  return {
    left: origin.x,
    top: origin.y,
    width: BOOTH_TV_SCREEN.w * layout.scale,
    height: BOOTH_TV_SCREEN.h * layout.scale,
  };
}

function drawSeated(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mine: boolean,
  live: boolean,
  colors: LobbyCanvasColors
) {
  const shirt = mine ? colors.accent : "#c45c7a";
  px(ctx, "#1a1420", x - 8, y + 2, 16, 4);
  px(ctx, PLAYER_HAIR, x - 7, y - 22, 14, 8);
  px(ctx, PLAYER_HAIR_HL, x - 4, y - 21, 8, 3);
  px(ctx, SKIN, x - 6, y - 15, 12, 7);
  px(ctx, SKIN_SH, x - 6, y - 9, 12, 1);
  px(ctx, LINE, x - 4, y - 12, 2, 2);
  px(ctx, LINE, x + 2, y - 12, 2, 2);
  px(ctx, shirt, x - 8, y - 8, 16, 10);
  px(ctx, "#9cf4ff", x - 4, y - 4, 8, 2);
  if (live) {
    px(ctx, colors.highlight, x - 2, y - 24, 4, 3);
  }
}

function drawSnow(
  ctx: CanvasRenderingContext2D,
  nowMs: number,
  reducedMotion: boolean
) {
  const r = BOOTH_TV_SCREEN;
  px(ctx, "#121018", r.x, r.y, r.w, r.h);
  const seed = reducedMotion ? 3 : Math.floor(nowMs / 180);
  for (let y = r.y; y < r.y + r.h; y += 2) {
    for (let x = r.x; x < r.x + r.w; x += 2) {
      const n = (x * 13 + y * 31 + seed * 17) & 7;
      if (n < 2) px(ctx, n === 0 ? "#3a3648" : "#2a2638", x, y, 2, 2);
    }
  }
}

function drawWallPoster(
  ctx: CanvasRenderingContext2D,
  r: BoothRect,
  accent: string
) {
  px(ctx, "#0a1018", r.x, r.y, r.w, r.h);
  px(ctx, accent, r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  px(ctx, "#071018", r.x + 4, r.y + 4, r.w - 8, r.h - 8);
  for (let y = r.y + 6; y < r.y + r.h - 8; y += 2) {
    px(ctx, "#0c2430", r.x + 6, y, r.w - 12, 1);
  }
  px(ctx, "#c8b070", r.x + 8, r.y + r.h - 8, r.w - 16, 2);
}

export function drawBoothFrame(
  ctx: CanvasRenderingContext2D,
  state: BoothDrawState
): void {
  const colors = mergeColors(state.colors);
  const { width, height } = GO_BOOTH_WORLD;
  ctx.clearRect(0, 0, width, height);
  px(ctx, colors.wallDark, 0, 0, width, height);

  const tile = 16;
  for (let y = BOOTH_WALL_TOP; y < height - BOOTH_WALL_BOTTOM; y += tile) {
    for (let x = BOOTH_WALL_SIDE; x < width - BOOTH_WALL_SIDE; x += tile) {
      const odd = (x / tile + y / tile) % 2 === 1;
      px(ctx, odd ? colors.floorB : colors.floorA, x, y, tile, tile);
      px(ctx, "#4a4462", x, y, tile, 1);
      px(ctx, "#4a4462", x, y, 1, tile);
    }
  }

  px(ctx, colors.wall, 0, 0, width, BOOTH_WALL_TOP + 10);
  px(ctx, colors.wallDark, 0, 0, width, 6);
  px(ctx, colors.highlight, 0, BOOTH_WALL_TOP + 8, width, 2);

  drawWallPoster(ctx, BOOTH_AD_LEFT, colors.accent);
  drawWallPoster(ctx, BOOTH_AD_RIGHT, colors.highlight);

  const tv = BOOTH_TV;
  const hoverTv = state.hoverHotspot === "tv";
  px(ctx, colors.wood, tv.x, tv.y, tv.w, tv.h);
  px(ctx, "#1a1420", tv.x + 4, tv.y + 4, tv.w - 8, tv.h - 12);
  px(ctx, hoverTv ? colors.accent : "#2a2438", tv.x + 6, tv.y + tv.h - 8, tv.w - 12, 4);
  drawSnow(ctx, state.nowMs ?? 0, Boolean(state.reducedMotion) || Boolean(state.tvOn));

  const door = BOOTH_DOOR;
  px(ctx, colors.wood, door.x, door.y, door.w, door.h);
  px(ctx, "#3a2a1c", door.x + 4, door.y + 6, door.w - 8, door.h - 12);
  px(ctx, state.hoverHotspot === "door" ? colors.accent : colors.highlight, door.x + 18, door.y + 28, 4, 4);

  const shelf = BOOTH_SHELF;
  px(ctx, colors.wood, shelf.x, shelf.y, shelf.w, shelf.h);
  px(ctx, "#3a2a1c", shelf.x + 3, shelf.y + 6, shelf.w - 6, 10);
  px(ctx, "#3a2a1c", shelf.x + 3, shelf.y + 22, shelf.w - 6, 10);
  px(ctx, "#3a2a1c", shelf.x + 3, shelf.y + 38, shelf.w - 6, 10);
  if (state.hoverHotspot === "shelf") {
    px(ctx, colors.accent, shelf.x, shelf.y, 2, shelf.h);
  }

  for (const seat of BOOTH_SEATS) {
    px(ctx, "#4a3a2c", seat.x, seat.y + 8, seat.w, seat.h - 8);
    px(ctx, "#6a4e3a", seat.x + 2, seat.y + 4, seat.w - 4, 10);
  }

  const seated = state.occupants.slice(0, BOOTH_SEATS.length);
  seated.forEach((o, i) => {
    const c = boothSeatCenter(i);
    const hover = state.hoverHotspot === `seat:${i}`;
    drawSeated(
      ctx,
      c.x,
      c.y,
      o.mine,
      o.liveVideo || o.liveAudio || hover,
      colors
    );
  });
}
