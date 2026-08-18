import {
  LOBBY_AD,
  LOBBY_BOSS,
  LOBBY_BULLETIN,
  LOBBY_CABINETS,
  LOBBY_ENTRANCE,
  LOBBY_HELP,
  LOBBY_SIGN,
  LOBBY_STORAGE,
  LOBBY_WALL_BOTTOM,
  LOBBY_WALL_SIDE,
  LOBBY_WALL_TOP,
} from "./goLobbyLayout";
import {
  GO_LOBBY_HOTSPOTS,
  GO_LOBBY_WORLD,
  type ShopHotspot,
  type ShopHotspotId,
} from "./goShopHotspots";
import type { Vec2, WalkFacing } from "./goShopWalk";

export type LobbyCanvasColors = {
  floorA: string;
  floorB: string;
  aisle: string;
  wall: string;
  wallDark: string;
  accent: string;
  ink: string;
  highlight: string;
  wood: string;
};

export const DEFAULT_LOBBY_COLORS: LobbyCanvasColors = {
  floorA: "#2c2640",
  floorB: "#252038",
  aisle: "#3a334c",
  wall: "#3e3858",
  wallDark: "#2a243c",
  accent: "#4ae0ff",
  ink: "#efe6d8",
  highlight: "#ffd45c",
  wood: "#7a5e46",
};

const SKIN = "#f3c7a2";
const SKIN_SH = "#d9a57e";
const HAIR = "#3a2418";
const LINE = "#16121c";

export type LobbyDrawState = {
  avatar: Vec2;
  nearHotspot: ShopHotspotId | null;
  hoverHotspot: ShopHotspotId | null;
  colors?: Partial<LobbyCanvasColors>;
  facing?: WalkFacing;
  walkFrame?: number;
  walking?: boolean;
};

export type CanvasLayout = {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  scale: number;
};

/** Fit world into container width; preserve aspect. */
export function computeLobbyCanvasLayout(
  containerWidth: number,
  dpr: number = 1
): CanvasLayout {
  const aspect = GO_LOBBY_WORLD.height / GO_LOBBY_WORLD.width;
  const cssWidth = Math.max(280, Math.min(containerWidth, 640));
  const cssHeight = Math.round(cssWidth * aspect);
  const scale = cssWidth / GO_LOBBY_WORLD.width;
  return { cssWidth, cssHeight, dpr: Math.max(1, dpr), scale };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  layout: CanvasLayout
): Vec2 {
  return {
    x: screenX / layout.scale,
    y: screenY / layout.scale,
  };
}

export function worldToScreen(x: number, y: number, layout: CanvasLayout): Vec2 {
  return { x: x * layout.scale, y: y * layout.scale };
}

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

function drawRoom(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors) {
  const { width, height } = GO_LOBBY_WORLD;
  px(ctx, colors.wallDark, 0, 0, width, height);

  const tile = 16;
  for (let y = LOBBY_WALL_TOP; y < height - LOBBY_WALL_BOTTOM; y += tile) {
    for (let x = LOBBY_WALL_SIDE; x < width - LOBBY_WALL_SIDE; x += tile) {
      const odd = (x / tile + y / tile) % 2 === 1;
      px(ctx, odd ? colors.floorB : colors.floorA, x, y, tile, tile);
      px(ctx, "#1c1828", x, y, tile, 1);
      px(ctx, "#1c1828", x, y, 1, tile);
    }
  }

  const aisleY = LOBBY_CABINETS[0]!.y + LOBBY_CABINETS[0]!.h;
  px(ctx, colors.aisle, 40, aisleY, 232, height - LOBBY_WALL_BOTTOM - aisleY);
  for (let x = 48; x < 264; x += 8) {
    px(ctx, "#2e283e", x, aisleY + 2, 4, 1);
  }

  px(ctx, colors.wall, 0, 0, width, LOBBY_WALL_TOP);
  px(ctx, colors.wallDark, 0, 0, width, 7);
  for (let x = 16; x < width; x += 40) {
    px(ctx, "#4a4462", x, 8, 2, LOBBY_WALL_TOP - 10);
  }
  px(ctx, "#5a2a4a", 0, LOBBY_WALL_TOP - 3, width, 1);
  px(ctx, colors.highlight, 0, LOBBY_WALL_TOP - 2, width, 2);
  px(ctx, "#fff3a8", 8, LOBBY_WALL_TOP - 2, 6, 2);
  px(ctx, "#fff3a8", 72, LOBBY_WALL_TOP - 2, 6, 2);
  px(ctx, "#fff3a8", 248, LOBBY_WALL_TOP - 2, 6, 2);

  px(ctx, colors.wall, 0, 0, LOBBY_WALL_SIDE, height);
  px(ctx, colors.wall, width - LOBBY_WALL_SIDE, 0, LOBBY_WALL_SIDE, height);
  px(ctx, "#4a4462", 2, 40, 6, 18);
  px(ctx, "#4a4462", width - 8, 48, 6, 18);

  px(ctx, colors.wall, 0, height - LOBBY_WALL_BOTTOM, width, LOBBY_WALL_BOTTOM);
  px(
    ctx,
    colors.aisle,
    LOBBY_ENTRANCE.x,
    height - LOBBY_WALL_BOTTOM,
    LOBBY_ENTRANCE.w,
    LOBBY_WALL_BOTTOM
  );
  px(ctx, colors.wood, LOBBY_ENTRANCE.x + 6, height - 9, LOBBY_ENTRANCE.w - 12, 7);
  px(ctx, "#5a4030", LOBBY_ENTRANCE.x + 6, height - 9, LOBBY_ENTRANCE.w - 12, 1);
  for (let i = 0; i < 6; i += 1) {
    px(ctx, i % 2 === 0 ? "#8a6a4e" : "#6a4e38", LOBBY_ENTRANCE.x + 10 + i * 12, height - 7, 10, 4);
  }
  px(ctx, colors.wallDark, LOBBY_ENTRANCE.x - 4, height - 18, 6, 18);
  px(ctx, colors.wallDark, LOBBY_ENTRANCE.x + LOBBY_ENTRANCE.w - 2, height - 18, 6, 18);
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number) {
  px(ctx, LINE, x + 4, y, 2, 6);
  px(ctx, "#3a3450", x, y + 6, 10, 4);
  px(ctx, "#ffe9a0", x + 2, y + 7, 6, 2);
}

function drawSign(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors) {
  const r = LOBBY_SIGN;
  px(ctx, "#0c1820", r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  px(ctx, colors.accent, r.x, r.y, r.w, r.h);
  px(ctx, "#9cf4ff", r.x + 2, r.y + 1, r.w - 4, 2);
  px(ctx, "#102830", r.x + 3, r.y + 3, r.w - 6, r.h - 5);
  ctx.fillStyle = colors.accent;
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillText("山姆鍋遊樂場", r.x + r.w / 2, r.y + 11);
  ctx.textAlign = "start";
  px(ctx, colors.highlight, r.x + 4, r.y + 1, 2, 2);
  px(ctx, colors.highlight, r.x + r.w - 6, r.y + 1, 2, 2);
}

function drawBulletin(ctx: CanvasRenderingContext2D, active: boolean) {
  const r = LOBBY_BULLETIN;
  px(ctx, "#6a4e32", r.x, r.y, r.w, r.h);
  px(ctx, "#c4a06a", r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  for (let y = r.y + 3; y < r.y + r.h - 2; y += 3) {
    for (let x = r.x + 3; x < r.x + r.w - 2; x += 4) {
      px(ctx, "#b89058", x, y, 1, 1);
    }
  }
  px(ctx, "#f7f1e4", r.x + 6, r.y + 4, 18, 12);
  px(ctx, "#c45c5c", r.x + 8, r.y + 3, 2, 2);
  px(ctx, "#d0d0d0", r.x + 8, r.y + 7, 12, 1);
  px(ctx, "#d0d0d0", r.x + 8, r.y + 9, 10, 1);
  px(ctx, "#dfeaf8", r.x + 28, r.y + 3, 16, 13);
  px(ctx, "#3d6aaa", r.x + 30, r.y + 2, 2, 2);
  px(ctx, "#7aa0c8", r.x + 30, r.y + 6, 11, 6);
  px(ctx, "#f8d4c4", r.x + 48, r.y + 4, 14, 11);
  px(ctx, "#c45c5c", r.x + 50, r.y + 3, 2, 2);
  px(ctx, "#e8a090", r.x + 50, r.y + 7, 9, 5);
  px(ctx, "#fff8e8", r.x + 64, r.y + 5, 8, 9);
  if (active) strokeActive(ctx, r);
}

function drawAd(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors) {
  const r = LOBBY_AD;
  px(ctx, "#0a1018", r.x, r.y, r.w, r.h);
  px(ctx, colors.accent, r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  px(ctx, "#071018", r.x + 5, r.y + 5, r.w - 10, r.h - 10);
  for (let y = r.y + 6; y < r.y + r.h - 6; y += 2) {
    px(ctx, "#0c2430", r.x + 6, y, r.w - 12, 1);
  }
  ctx.fillStyle = colors.highlight;
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("PLAY", r.x + r.w / 2, r.y + 17);
  ctx.textAlign = "start";
  px(ctx, "#fff3a8", r.x + 8, r.y + r.h - 7, r.w - 16, 2);
}

type FigurePalette = {
  hair: string;
  skin: string;
  skinSh: string;
  shirt: string;
  stripe: string;
  pants: string;
  shoes: string;
};

const BOSS_PALETTE: FigurePalette = {
  hair: "#2a1810",
  skin: SKIN,
  skinSh: SKIN_SH,
  shirt: "#2c3a6a",
  stripe: "#4ae0ff",
  pants: "#1a2438",
  shoes: "#1a1420",
};

function playerPalette(colors: LobbyCanvasColors): FigurePalette {
  return {
    hair: HAIR,
    skin: SKIN,
    skinSh: SKIN_SH,
    shirt: colors.accent,
    stripe: "#9cf4ff",
    pants: "#2a6a78",
    shoes: LINE,
  };
}

function walkOffsets(walking: boolean, frame: number): { bob: number; lead: number } {
  if (!walking) return { bob: 0, lead: 0 };
  const step = frame % 4;
  if (step === 1) return { bob: -1, lead: -1 };
  if (step === 3) return { bob: -1, lead: 1 };
  return { bob: 0, lead: 0 };
}

/** Origin at feet (collision center). Sprite is taller than the hit circle. */
function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pal: FigurePalette,
  facing: WalkFacing,
  walking: boolean,
  frame: number,
  hideLower = false
) {
  const { bob, lead } = walkOffsets(walking, frame);
  const by = y + bob;
  if (!hideLower) {
    px(ctx, "#1a1420", x - 7, y + 3, 14, 4);
  }

  if (facing === "left" || facing === "right") {
    const flip = facing === "left" ? -1 : 1;
    const hx = x + (flip === 1 ? -5 : -7);
    px(ctx, pal.hair, hx, by - 26, 12, 8);
    px(ctx, pal.skin, hx + 1, by - 19, 10, 8);
    px(ctx, pal.skinSh, hx + 1, by - 12, 10, 1);
    px(ctx, LINE, hx + (flip === 1 ? 7 : 2), by - 16, 2, 2);
    px(ctx, pal.skin, hx + (flip === 1 ? 10 : -1), by - 15, 2, 3);
    px(ctx, pal.shirt, hx, by - 11, 12, hideLower ? 8 : 12);
    px(ctx, pal.stripe, hx + 3, by - 7, 6, 2);
    px(ctx, pal.skin, hx + (flip === 1 ? 11 : -2), by - 9, 3, hideLower ? 4 : 6);
    if (!hideLower) {
      px(ctx, pal.pants, hx + 1, by + 1, 10, 5);
      px(ctx, pal.shoes, hx + 1 + lead, by + 5, 5, 3);
      px(ctx, pal.shoes, hx + 6 - lead, by + 5, 5, 3);
    }
    return;
  }

  if (facing === "up") {
    px(ctx, pal.hair, x - 7, by - 26, 14, 10);
    px(ctx, pal.shirt, x - 7, by - 16, 14, hideLower ? 10 : 14);
    px(ctx, pal.stripe, x - 4, by - 8, 8, 3);
    px(ctx, pal.skin, x - 9, by - 12, 3, hideLower ? 5 : 7);
    px(ctx, pal.skin, x + 6, by - 12, 3, hideLower ? 5 : 7);
    if (!hideLower) {
      px(ctx, pal.pants, x - 6, by - 2, 12, 6);
      px(ctx, pal.shoes, x - 6, by + 4 + (lead < 0 ? 1 : 0), 5, 4);
      px(ctx, pal.shoes, x + 1, by + 4 + (lead > 0 ? 1 : 0), 5, 4);
    }
    return;
  }

  px(ctx, pal.hair, x - 7, by - 26, 14, 8);
  px(ctx, pal.skin, x - 6, by - 19, 12, 8);
  px(ctx, pal.skinSh, x - 6, by - 12, 12, 1);
  px(ctx, LINE, x - 4, by - 16, 2, 2);
  px(ctx, LINE, x + 2, by - 16, 2, 2);
  px(ctx, pal.shirt, x - 7, by - 11, 14, 12);
  px(ctx, pal.stripe, x - 4, by - 7, 8, 3);
  px(ctx, pal.skin, x - 9, by - 9, 3, hideLower ? 4 : 6);
  px(ctx, pal.skin, x + 6, by - 9, 3, hideLower ? 4 : 6);
  if (!hideLower) {
    px(ctx, pal.pants, x - 6, by + 1, 12, 5);
    px(ctx, pal.shoes, x - 6, by + 5 + (lead < 0 ? 1 : 0), 5, 3);
    px(ctx, pal.shoes, x + 1, by + 5 + (lead > 0 ? 1 : 0), 5, 3);
  }
}

function drawCounter(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors, active: boolean) {
  const r = LOBBY_BOSS;
  drawFigure(ctx, r.x + 52, r.y + 14, BOSS_PALETTE, "down", false, 0, true);

  px(ctx, "#2a2438", r.x + 2, r.y + r.h - 4, r.w - 4, 4);
  px(ctx, "#4a4568", r.x, r.y + 16, r.w, r.h - 16);
  px(ctx, "#5c5678", r.x + 2, r.y + 18, r.w - 4, 8);
  px(ctx, colors.wood, r.x - 2, r.y + 12, r.w + 4, 6);
  px(ctx, "#9a7a58", r.x - 2, r.y + 12, r.w + 4, 2);
  px(ctx, LINE, r.x - 2, r.y + 18, r.w + 4, 1);

  px(ctx, "#1a2430", r.x + 8, r.y + 2, 20, 12);
  px(ctx, colors.accent, r.x + 10, r.y + 4, 16, 8);
  px(ctx, "#0e2830", r.x + 12, r.y + 5, 12, 6);
  px(ctx, "#7ae0a6", r.x + 14, r.y + 7, 3, 2);
  px(ctx, colors.highlight, r.x + 18, r.y + 7, 4, 2);

  px(ctx, "#d8d0c4", r.x + 32, r.y + 8, 8, 6);
  px(ctx, "#c45c5c", r.x + 34, r.y + 6, 4, 3);

  px(ctx, "#2d6a3a", r.x + 68, r.y + 6, 8, 8);
  px(ctx, "#3d8a4a", r.x + 70, r.y + 4, 4, 4);
  px(ctx, "#8a5a32", r.x + 71, r.y + 12, 2, 4);
  if (active) strokeActive(ctx, r);
}

function drawHelp(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors, active: boolean) {
  const r = LOBBY_HELP;
  px(ctx, "#2a3048", r.x + 4, r.y + r.h - 4, r.w - 8, 4);
  px(ctx, "#4a6088", r.x + 2, r.y + 14, r.w - 4, r.h - 18);
  px(ctx, "#5a78a0", r.x, r.y + 10, r.w, 8);
  px(ctx, colors.accent, r.x + 2, r.y, r.w - 4, 12);
  px(ctx, "#e8fbff", r.x + 4, r.y + 2, r.w - 8, 8);
  ctx.fillStyle = "#1a4060";
  ctx.font = "bold 11px monospace";
  ctx.textAlign = "center";
  ctx.fillText("i", r.x + r.w / 2, r.y + 10);
  ctx.textAlign = "start";
  px(ctx, "#f4efe4", r.x + 6, r.y + 20, 8, 6);
  px(ctx, "#dfeaf4", r.x + 16, r.y + 20, 8, 6);
  px(ctx, LINE, r.x + r.w / 2 - 1, r.y + 26, 2, 2);
  if (active) strokeActive(ctx, r);
}

function drawCabinetScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: number
) {
  px(ctx, "#071018", x, y, w, h);
  if (kind === 0) {
    px(ctx, "#3de0ff", x + 2, y + 8, 3, 2);
    px(ctx, "#fff", x + 6, y + 3, 1, 1);
    px(ctx, "#fff", x + 11, y + 6, 1, 1);
    px(ctx, "#c45c8a", x + 4, y + 5, 6, 4);
    px(ctx, "#f6c453", x + 8, y + 2, 2, 2);
  } else if (kind === 1) {
    for (let row = 0; row < 3; row += 1) {
      const c = ["#c45c5c", "#f6c453", "#3de0ff"][row]!;
      for (let col = 0; col < 4; col += 1) {
        px(ctx, c, x + 2 + col * 4, y + 2 + row * 3, 3, 2);
      }
    }
    px(ctx, "#efe6d8", x + 7, y + h - 4, 4, 2);
  } else if (kind === 2) {
    px(ctx, "#1a3048", x + 1, y + 1, w - 2, 5);
    px(ctx, "#3a2018", x + 1, y + 6, w - 2, h - 7);
    px(ctx, "#f6c453", x + w / 2 - 1, y + 6, 2, h - 8);
    px(ctx, "#efe6d8", x + w / 2 - 3, y + h - 5, 6, 3);
  } else {
    px(ctx, "#143018", x + 1, y + 1, w - 2, h - 2);
    px(ctx, "#7ae0a6", x + 2, y + h - 4, w - 4, 2);
    px(ctx, "#efe6d8", x + 6, y + 4, 3, 5);
    px(ctx, "#3de0ff", x + 5, y + 9, 5, 3);
  }
}

function drawCabinet(
  ctx: CanvasRenderingContext2D,
  colors: LobbyCanvasColors,
  r: { x: number; y: number; w: number; h: number },
  hue: string,
  kind: number
) {
  px(ctx, LINE, r.x, r.y, r.w, r.h);
  px(ctx, "#2a2438", r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  px(ctx, hue, r.x + 1, r.y + 1, r.w - 2, 8);
  px(ctx, "#fff8e0", r.x + 3, r.y + 2, r.w - 8, 2);
  px(ctx, LINE, r.x + 3, r.y + 9, r.w - 6, 1);
  px(ctx, "#12101a", r.x + 3, r.y + 10, r.w - 6, 16);
  drawCabinetScreen(ctx, r.x + 5, r.y + 12, r.w - 10, 12, kind);
  px(ctx, "#3a3458", r.x + 2, r.y + 27, r.w - 4, 7);
  px(ctx, "#4a4468", r.x + 3, r.y + 28, r.w - 6, 2);
  px(ctx, "#1c1828", r.x + 6, r.y + 30, 4, 4);
  px(ctx, "#efe6d8", r.x + 7, r.y + 29, 2, 3);
  px(ctx, "#c45c5c", r.x + r.w - 14, r.y + 30, 3, 3);
  px(ctx, colors.highlight, r.x + r.w - 10, r.y + 30, 3, 3);
  px(ctx, "#7ae0a6", r.x + r.w - 6, r.y + 30, 3, 3);
  px(ctx, "#1a1624", r.x + 4, r.y + 35, r.w - 8, r.h - 36);
  px(ctx, "#0e0c14", r.x + r.w / 2 - 3, r.y + 37, 6, 4);
  px(ctx, colors.highlight, r.x + r.w / 2 - 1, r.y + 38, 2, 2);
}

function drawCabinets(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors, active: boolean) {
  const hues = ["#c45c8a", "#2cb8d8", "#e0a030", "#3aaa68"];
  LOBBY_CABINETS.forEach((r, i) => {
    drawCabinet(ctx, colors, r, hues[i % hues.length]!, i);
  });
  if (active) {
    for (const r of LOBBY_CABINETS) strokeActive(ctx, r);
  }
}

function drawStorage(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors, active: boolean) {
  const r = LOBBY_STORAGE;
  px(ctx, colors.wallDark, r.x, r.y, r.w, r.h);
  px(ctx, "#3a2a1c", r.x + 2, r.y + 4, r.w - 4, r.h - 8);
  px(ctx, colors.wood, r.x + 4, r.y + 6, r.w - 8, r.h - 12);
  px(ctx, "#5a4030", r.x + r.w / 2 - 1, r.y + 6, 2, r.h - 12);
  px(ctx, "#7ec8e8", r.x + 7, r.y + 10, r.w - 16, 10);
  px(ctx, "#d8eef8", r.x + 8, r.y + 11, 6, 4);
  px(ctx, "#1a2430", r.x + 6, r.y + 22, r.w - 12, 8);
  ctx.fillStyle = colors.ink;
  ctx.font = "6px monospace";
  ctx.textAlign = "center";
  ctx.fillText("後場", r.x + r.w / 2, r.y + 28);
  ctx.textAlign = "start";
  px(ctx, "#2a2018", r.x + r.w - 11, r.y + 34, 5, 8);
  px(ctx, colors.highlight, r.x + r.w - 10, r.y + 36, 2, 3);
  if (active) strokeActive(ctx, r);
}

function strokeActive(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; w: number; h: number }
) {
  ctx.strokeStyle = DEFAULT_LOBBY_COLORS.highlight;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: Vec2,
  colors: LobbyCanvasColors,
  facing: WalkFacing,
  walking: boolean,
  walkFrame: number
) {
  drawFigure(
    ctx,
    Math.round(avatar.x),
    Math.round(avatar.y),
    playerPalette(colors),
    facing,
    walking,
    walkFrame
  );
}

/** Paint one frame of the indoor lobby (world coordinates). No bitmap assets. */
export function drawLobbyFrame(
  ctx: CanvasRenderingContext2D,
  state: LobbyDrawState,
  hotspots: readonly ShopHotspot[] = GO_LOBBY_HOTSPOTS
): void {
  const colors = mergeColors(state.colors);
  ctx.clearRect(0, 0, GO_LOBBY_WORLD.width, GO_LOBBY_WORLD.height);
  drawRoom(ctx, colors);
  drawLamp(ctx, 70, 24);
  drawLamp(ctx, 160, 24);
  drawLamp(ctx, 250, 24);
  drawSign(ctx, colors);
  const active = state.nearHotspot ?? state.hoverHotspot;
  drawBulletin(ctx, active === "bulletin");
  drawAd(ctx, colors);
  drawCounter(ctx, colors, active === "boss");
  drawHelp(ctx, colors, active === "help");
  drawCabinets(ctx, colors, active === "cabinet");
  drawStorage(ctx, colors, active === "storage");
  drawAvatar(
    ctx,
    state.avatar,
    colors,
    state.facing ?? "down",
    state.walking ?? false,
    state.walkFrame ?? 0
  );

  if (state.nearHotspot) {
    const spot = hotspots.find((h) => h.id === state.nearHotspot);
    if (spot) {
      ctx.fillStyle = colors.ink;
      ctx.font = "10px monospace";
      ctx.textAlign = "start";
      ctx.fillText(spot.label, spot.x, Math.max(12, spot.y - 4));
    }
  }
}
