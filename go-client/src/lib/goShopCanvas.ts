import {
  LOBBY_AD,
  LOBBY_BOSS,
  LOBBY_BULLETIN,
  LOBBY_CABINETS,
  LOBBY_ROOM,
  LOBBY_ENTRANCE,
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
import { walkAnimFrame, type Vec2, type WalkFacing } from "./goShopWalk";
import { nearestLobbyCabinetIndex } from "./goLobbyCabinets";

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
  floorA: "#6e6488",
  floorB: "#625886",
  aisle: "#7c7396",
  wall: "#3e3858",
  wallDark: "#2a243c",
  accent: "#4ae0ff",
  ink: "#efe6d8",
  highlight: "#ffd45c",
  wood: "#7a5e46",
};

const SKIN = "#f3c7a2";
const SKIN_SH = "#d9a57e";
export const PLAYER_HAIR = "#3a2418";
export const PLAYER_HAIR_HL = "#8a5a38";
const LINE = "#16121c";

export type LobbyDrawState = {
  avatar: Vec2;
  nearHotspot: ShopHotspotId | null;
  hoverHotspot: ShopHotspotId | null;
  colors?: Partial<LobbyCanvasColors>;
  facing?: WalkFacing;
  walkFrame?: number;
  walking?: boolean;
  sfxEnabled?: boolean;
  /** Attract-mode clock for cabinet demo screens (ms). Frozen at 0 when omitted. */
  nowMs?: number;
  /** Full titles for the proximity prompt. */
  cabinetTitles?: readonly string[];
  /** Catalog series for marquees and attract demos. */
  cabinetSeries?: readonly string[];
  /** Which machine to outline／label when the cabinet hotspot is active. */
  activeCabinetIndex?: number | null;
  /** Machine the avatar is standing by (screen glow, not hover). */
  litCabinetIndex?: number | null;
};

export const LOBBY_ATTRACT_FRAME_MS = 160;
export const LOBBY_ATTRACT_FRAMES = 8;

/** Demo frame for a cabinet attract loop. Cabinets are phase-offset. */
export function cabinetAttractTick(nowMs: number, cabinetIndex: number): number {
  const phase = Math.floor(Math.max(0, nowMs) / LOBBY_ATTRACT_FRAME_MS);
  return (phase + cabinetIndex * 2) % LOBBY_ATTRACT_FRAMES;
}

export type CabinetAttractStyle = "shmup" | "board" | "wheel" | "idle";

/** Map catalog `series` onto a tiny attract demo. Unknown series share the shmup loop. */
export function cabinetAttractStyle(
  series: string | undefined | null
): CabinetAttractStyle {
  switch (series) {
    case "街機":
      return "shmup";
    case "桌遊":
    case "策略":
      return "board";
    case "機台":
      return "wheel";
    case "懷舊":
    case "模擬":
      return "idle";
    default:
      return "shmup";
  }
}

export function cabinetMarqueeLabel(series: string | undefined | null): string {
  const trimmed = series?.trim() ?? "";
  if (!trimmed) return "INSERT";
  return trimmed.length > 2 ? trimmed.slice(0, 2) : trimmed;
}

export function cabinetStickOffset(tick: number): number {
  return (tick % 3) - 1;
}

export const BOSS_IDLE_CYCLE_MS = 8000;

export type BossIdlePose = {
  x: number;
  y: number;
  facing: WalkFacing;
  walking: boolean;
  walkFrame: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Occasional shuffle behind the counter; never leaves the desk. */
export function bossIdlePose(nowMs: number): BossIdlePose {
  const homeX = LOBBY_BOSS.x + 52;
  const leftX = homeX - 10;
  const rightX = homeX + 8;
  const y = LOBBY_BOSS.y + 14;
  const t = Math.max(0, nowMs) % BOSS_IDLE_CYCLE_MS;

  let x = homeX;
  let facing: WalkFacing = "down";
  let walking = false;
  let walkClock = 0;

  if (t < 2400) {
    x = homeX;
  } else if (t < 3000) {
    x = lerp(homeX, leftX, (t - 2400) / 600);
    facing = "left";
    walking = true;
    walkClock = t - 2400;
  } else if (t < 4600) {
    x = leftX;
  } else if (t < 5400) {
    x = lerp(leftX, rightX, (t - 4600) / 800);
    facing = "right";
    walking = true;
    walkClock = t - 4600;
  } else if (t < 6800) {
    x = rightX;
  } else if (t < 7400) {
    x = lerp(rightX, homeX, (t - 6800) / 600);
    facing = "left";
    walking = true;
    walkClock = t - 6800;
  }

  return {
    x: Math.round(x),
    y,
    facing,
    walking,
    walkFrame: walkAnimFrame(walkClock, walking),
  };
}

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
      px(ctx, "#4a4462", x, y, tile, 1);
      px(ctx, "#4a4462", x, y, 1, tile);
    }
  }

  const aisleY = LOBBY_CABINETS[0]!.y + LOBBY_CABINETS[0]!.h;
  px(ctx, colors.aisle, 40, aisleY, 232, height - LOBBY_WALL_BOTTOM - aisleY);
  for (let x = 48; x < 264; x += 8) {
    px(ctx, "#5a5470", x, aisleY + 2, 4, 1);
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

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, nowMs: number) {
  px(ctx, LINE, x + 4, y, 2, 6);
  px(ctx, "#3a3450", x, y + 6, 10, 4);
  const flicker = Math.floor(nowMs / 380 + x) % 8 !== 0;
  px(ctx, flicker ? "#ffe9a0" : "#8a7a48", x + 2, y + 7, 6, 2);
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

function drawAd(
  ctx: CanvasRenderingContext2D,
  colors: LobbyCanvasColors,
  muted: boolean,
  active: boolean,
  nowMs: number
) {
  const r = LOBBY_AD;
  const pulse = !muted && Math.floor(nowMs / 260) % 2 === 0;
  px(ctx, "#0a1018", r.x, r.y, r.w, r.h);
  px(ctx, muted ? "#3a4450" : pulse ? colors.accent : "#2a98b0", r.x + 2, r.y + 2, r.w - 4, r.h - 4);
  px(ctx, "#071018", r.x + 5, r.y + 5, r.w - 10, r.h - 10);
  for (let y = r.y + 6; y < r.y + r.h - 6; y += 2) {
    px(ctx, muted ? "#1a2228" : "#0c2430", r.x + 6, y, r.w - 12, 1);
  }
  ctx.fillStyle = muted ? "#8a9098" : pulse ? colors.highlight : "#d0b048";
  ctx.font = "bold 8px monospace";
  ctx.textAlign = "center";
  ctx.fillText(muted ? "MUTE" : "PLAY", r.x + r.w / 2, r.y + 17);
  ctx.textAlign = "start";
  px(ctx, muted ? "#5a6068" : pulse ? "#fff3a8" : "#c8b070", r.x + 8, r.y + r.h - 7, r.w - 16, 2);
  if (active) strokeActive(ctx, r);
}

type FigurePalette = {
  hair: string;
  hairHl: string;
  skin: string;
  skinSh: string;
  shirt: string;
  stripe: string;
  pants: string;
  shoes: string;
};

const BOSS_PALETTE: FigurePalette = {
  hair: "#2a1810",
  hairHl: "#5a3828",
  skin: SKIN,
  skinSh: SKIN_SH,
  shirt: "#2c3a6a",
  stripe: "#4ae0ff",
  pants: "#1a2438",
  shoes: "#1a1420",
};

function playerPalette(colors: LobbyCanvasColors): FigurePalette {
  return {
    hair: PLAYER_HAIR,
    hairHl: PLAYER_HAIR_HL,
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
    px(ctx, pal.hairHl, x - 4, by - 25, 8, 3);
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

function drawCounter(
  ctx: CanvasRenderingContext2D,
  colors: LobbyCanvasColors,
  active: boolean,
  nowMs: number
) {
  const r = LOBBY_BOSS;
  const pose = bossIdlePose(nowMs);
  drawFigure(ctx, pose.x, pose.y, BOSS_PALETTE, pose.facing, pose.walking, pose.walkFrame, true);

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

function drawBooth(ctx: CanvasRenderingContext2D, colors: LobbyCanvasColors, active: boolean) {
  const r = LOBBY_ROOM;
  px(ctx, colors.wallDark, r.x, r.y, r.w, r.h);
  px(ctx, "#3a2a1c", r.x + 2, r.y + 4, r.w - 4, r.h - 8);
  px(ctx, colors.wood, r.x + 4, r.y + 6, r.w - 8, r.h - 12);
  px(ctx, "#5a4030", r.x + r.w / 2 - 1, r.y + 6, 2, r.h - 12);
  const glow = active ? "#ffe08a" : "#c4a060";
  px(ctx, glow, r.x + 7, r.y + 10, r.w - 16, 10);
  px(ctx, "#fff3a8", r.x + 8, r.y + 11, 6, 4);
  px(ctx, "#1a2430", r.x + 6, r.y + 22, r.w - 12, 8);
  ctx.fillStyle = colors.ink;
  ctx.font = "6px monospace";
  ctx.textAlign = "center";
  ctx.fillText("包廂", r.x + r.w / 2, r.y + 28);
  ctx.textAlign = "start";
  px(ctx, "#2a2018", r.x + r.w - 11, r.y + 34, 5, 8);
  px(ctx, colors.highlight, r.x + r.w - 10, r.y + 36, 2, 3);
  if (active) strokeActive(ctx, r);
}

function drawCabinetScreen(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CabinetAttractStyle,
  tick: number,
  lit: boolean
) {
  px(ctx, lit ? "#143048" : "#071018", x, y, w, h);
  if (style === "shmup") {
    const shipX = 2 + Math.abs((tick % 8) - 4);
    const shotY = 2 + ((tick * 2) % Math.max(2, h - 5));
    px(ctx, "#fff", x + 3 + ((tick * 3) % (w - 5)), y + 2 + (tick % 4), 1, 1);
    px(ctx, "#fff", x + 8 + ((tick * 5) % (w - 9)), y + 5 + ((tick + 2) % 3), 1, 1);
    px(ctx, "#c45c8a", x + 4 + (tick % 3), y + 3, 5, 3);
    px(ctx, "#f6c453", x + 8, y + shotY, 1, 2);
    px(ctx, "#3de0ff", x + shipX, y + h - 4, 4, 2);
  } else if (style === "board") {
    px(ctx, "#3a2818", x + 1, y + 1, w - 2, h - 2);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const light = (row + col) % 2 === 0;
        px(
          ctx,
          light ? "#d8c4a0" : "#6a4e32",
          x + 2 + col * 4,
          y + 2 + row * 3,
          3,
          2
        );
      }
    }
    const cursor = tick % 9;
    px(
      ctx,
      "#c45c5c",
      x + 2 + (cursor % 3) * 4,
      y + 2 + Math.floor(cursor / 3) * 3,
      3,
      2
    );
  } else if (style === "wheel") {
    px(ctx, "#3a2018", x + 1, y + 1, w - 2, h - 2);
    const spoke = tick % 4;
    px(ctx, "#e8b020", x + 3, y + 2 + spoke, w - 6, 2);
    px(ctx, "#c45c5c", x + w / 2 - 1, y + 2, 2, h - 4);
    px(ctx, "#efe6d8", x + 4 + spoke, y + h - 4, 4, 2);
  } else {
    px(ctx, "#143018", x + 1, y + 1, w - 2, h - 2);
    px(ctx, "#7ae0a6", x + 2, y + h - 4, w - 4, 2);
    const bob = tick % 2;
    px(ctx, "#efe6d8", x + w / 2 - 2, y + 3 + bob, 3, 5);
    px(ctx, "#3de0ff", x + w / 2 - 3, y + 8 + bob, 5, 3);
  }
  if (lit) px(ctx, "#fff8e0", x + 1, y + 1, w - 2, 1);
}

function drawCabinet(
  ctx: CanvasRenderingContext2D,
  colors: LobbyCanvasColors,
  r: { x: number; y: number; w: number; h: number },
  hue: string,
  style: CabinetAttractStyle,
  tick: number,
  title: string,
  lit: boolean
) {
  if (lit) {
    px(ctx, colors.highlight, r.x - 2, r.y + r.h, r.w + 4, 3);
    px(ctx, "#fff3a8", r.x + 2, r.y + r.h, r.w - 4, 2);
  }
  px(ctx, LINE, r.x, r.y, r.w, r.h);
  px(ctx, "#2a2438", r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  px(ctx, hue, r.x + 1, r.y + 1, r.w - 2, 8);
  px(ctx, "#fff8e0", r.x + 3, r.y + 2, r.w - 8, 2);
  if (title) {
    ctx.fillStyle = "#1a1020";
    ctx.font = "6px monospace";
    ctx.textAlign = "center";
    ctx.fillText(title, r.x + r.w / 2, r.y + 8);
    ctx.textAlign = "start";
  }
  px(ctx, LINE, r.x + 3, r.y + 9, r.w - 6, 1);
  px(ctx, "#12101a", r.x + 3, r.y + 10, r.w - 6, 16);
  drawCabinetScreen(ctx, r.x + 5, r.y + 12, r.w - 10, 12, style, tick, lit);
  px(ctx, "#3a3458", r.x + 2, r.y + 27, r.w - 4, 7);
  px(ctx, "#4a4468", r.x + 3, r.y + 28, r.w - 6, 2);
  const stick = cabinetStickOffset(tick);
  px(ctx, "#1c1828", r.x + 6 + stick, r.y + 30, 4, 4);
  px(ctx, "#efe6d8", r.x + 7 + stick, r.y + 29, 2, 3);
  const blink = lit && tick % 2 === 0;
  px(ctx, blink ? "#ff8080" : "#c45c5c", r.x + r.w - 14, r.y + 30, 3, 3);
  px(ctx, blink ? "#fff3a8" : colors.highlight, r.x + r.w - 10, r.y + 30, 3, 3);
  px(ctx, blink ? "#b0ffd0" : "#7ae0a6", r.x + r.w - 6, r.y + 30, 3, 3);
  px(ctx, "#1a1624", r.x + 4, r.y + 35, r.w - 8, r.h - 36);
  px(ctx, "#0e0c14", r.x + r.w / 2 - 3, r.y + 37, 6, 4);
  px(ctx, colors.highlight, r.x + r.w / 2 - 1, r.y + 38, 2, 2);
}

function drawCabinets(
  ctx: CanvasRenderingContext2D,
  colors: LobbyCanvasColors,
  active: boolean,
  nowMs: number,
  series: readonly string[],
  avatar: Vec2,
  activeCabinetIndex: number | null,
  litCabinetIndex: number | null
) {
  const hues = ["#c45c8a", "#2cb8d8", "#e0a030", "#3aaa68"];
  LOBBY_CABINETS.forEach((r, i) => {
    const tick = cabinetAttractTick(nowMs, i);
    drawCabinet(
      ctx,
      colors,
      r,
      hues[i % hues.length]!,
      cabinetAttractStyle(series[i]),
      tick,
      cabinetMarqueeLabel(series[i]),
      litCabinetIndex === i
    );
  });
  if (active) {
    const i = activeCabinetIndex ?? nearestLobbyCabinetIndex(avatar.x, avatar.y);
    const r = i != null ? LOBBY_CABINETS[i] : null;
    if (r) strokeActive(ctx, r);
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
  const nowMs = state.nowMs ?? 0;
  ctx.clearRect(0, 0, GO_LOBBY_WORLD.width, GO_LOBBY_WORLD.height);
  drawRoom(ctx, colors);
  drawLamp(ctx, 70, 24, nowMs);
  drawLamp(ctx, 160, 24, nowMs);
  drawLamp(ctx, 250, 24, nowMs);
  drawSign(ctx, colors);
  const active = state.nearHotspot ?? state.hoverHotspot;
  drawBulletin(ctx, active === "bulletin");
  drawAd(ctx, colors, state.sfxEnabled === false, active === "sfx", nowMs);
  drawCounter(ctx, colors, active === "boss", nowMs);
  drawBooth(ctx, colors, active === "room");
  drawCabinets(
    ctx,
    colors,
    active === "cabinet",
    nowMs,
    state.cabinetSeries ?? [],
    state.avatar,
    state.activeCabinetIndex ?? null,
    state.litCabinetIndex ?? null
  );
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
      let label = spot.label;
      let lx = spot.x;
      let ly = Math.max(12, spot.y - 4);
      if (spot.id === "cabinet") {
        const i =
          state.activeCabinetIndex ??
          nearestLobbyCabinetIndex(state.avatar.x, state.avatar.y);
        const titled = i != null ? state.cabinetTitles?.[i] : undefined;
        if (titled) label = titled;
        const cab = i != null ? LOBBY_CABINETS[i] : null;
        if (cab) {
          lx = cab.x;
          ly = Math.max(12, cab.y - 4);
        }
      }
      ctx.fillStyle = colors.ink;
      ctx.font = "10px monospace";
      ctx.textAlign = "start";
      ctx.fillText(label, lx, ly);
    }
  }
}
