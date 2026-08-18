import { GO_LOBBY_TILE, GO_LOBBY_WORLD, type ShopHotspotId } from "./goShopHotspots";
import type { LobbyImageLoader } from "./goLobbyAssets";

export const LOBBY_TILE_BASE = "/lobby/tiles";

export type LobbyTileId = `r${string}_c${string}`;

export type LobbyTileSheet = Partial<Record<LobbyTileId, CanvasImageSource>>;

export type LobbyStamp = {
  hotspot: ShopHotspotId | null;
  x: number;
  y: number;
  cells: ReadonlyArray<ReadonlyArray<LobbyTileId | null>>;
};

export const LOBBY_FLOOR_TILES = {
  base: "r00_c11" as LobbyTileId,
  walkway: "r00_c16" as LobbyTileId,
  walkwayAlt: "r00_c19" as LobbyTileId,
  wood: "r00_c24" as LobbyTileId,
  carpet: "r00_c01" as LobbyTileId,
  wall: "r04_c01" as LobbyTileId,
  wallNeon: "r03_c08" as LobbyTileId,
  wallPanel: "r02_c01" as LobbyTileId,
} as const;

/** Furniture / props placed on top of the floor grid (world px). */
export const LOBBY_STAMPS: readonly LobbyStamp[] = [
  {
    hotspot: "boss",
    x: 16,
    y: 32,
    cells: [
      ["r10_c13", "r10_c14", "r10_c15"],
      ["r11_c02", "r11_c03", "r11_c34"],
    ],
  },
  {
    hotspot: "bulletin",
    x: 96,
    y: 16,
    cells: [
      ["r03_c16", "r03_c17"],
      ["r02_c16", "r02_c17"],
    ],
  },
  {
    hotspot: null,
    x: 160,
    y: 32,
    cells: [
      ["r14_c11", "r16_c13"],
      ["r16_c12", null],
    ],
  },
  {
    hotspot: null,
    x: 224,
    y: 16,
    cells: [
      ["r16_c03", "r16_c04", "r14_c09"],
      ["r14_c10", "r16_c01", "r16_c02"],
    ],
  },
  {
    hotspot: "cabinet",
    x: 40,
    y: 96,
    cells: [
      ["r14_c01", "r14_c04", "r14_c05", "r14_c06"],
      ["r15_c01", "r15_c04", "r15_c05", "r15_c13"],
    ],
  },
  {
    hotspot: "storage",
    x: 240,
    y: 96,
    cells: [
      ["r06_c03", "r06_c04"],
      ["r06_c25", "r06_c27"],
    ],
  },
];

export function lobbyTileFile(id: LobbyTileId): string {
  return `${id}.png`;
}

export function lobbyTileUrl(
  id: LobbyTileId,
  base: string = LOBBY_TILE_BASE
): string {
  return `${base.replace(/\/$/, "")}/${lobbyTileFile(id)}`;
}

/** Background tile for a 16px cell. ty 0–1 = wall band. */
export function floorTileAt(tx: number, ty: number): LobbyTileId {
  if (ty <= 1) {
    if (tx >= 6 && tx <= 12) return LOBBY_FLOOR_TILES.wallNeon;
    return ty === 0 ? LOBBY_FLOOR_TILES.wallPanel : LOBBY_FLOOR_TILES.wall;
  }
  if (ty >= 5 && ty <= 7) {
    return tx % 5 === 0 ? LOBBY_FLOOR_TILES.walkwayAlt : LOBBY_FLOOR_TILES.walkway;
  }
  if (tx <= 4 && ty >= 2 && ty <= 4) return LOBBY_FLOOR_TILES.wood;
  if (tx >= 8 && tx <= 12 && ty >= 8 && ty <= 10) return LOBBY_FLOOR_TILES.carpet;
  return LOBBY_FLOOR_TILES.base;
}

export function uniqueLobbyTileIds(): Set<LobbyTileId> {
  const ids = new Set<LobbyTileId>(Object.values(LOBBY_FLOOR_TILES));
  const cols = GO_LOBBY_WORLD.width / GO_LOBBY_TILE;
  const rows = Math.ceil(GO_LOBBY_WORLD.height / GO_LOBBY_TILE);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) ids.add(floorTileAt(tx, ty));
  }
  for (const stamp of LOBBY_STAMPS) {
    for (const row of stamp.cells) {
      for (const id of row) {
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

export function lobbyTilesReady(
  sheet: LobbyTileSheet | null | undefined
): boolean {
  if (!sheet) return false;
  for (const id of uniqueLobbyTileIds()) {
    if (sheet[id] == null) return false;
  }
  return true;
}

export function drawLobbyTile(
  ctx: CanvasRenderingContext2D,
  sheet: LobbyTileSheet,
  id: LobbyTileId,
  x: number,
  y: number,
  w: number = GO_LOBBY_TILE,
  h: number = GO_LOBBY_TILE
): boolean {
  const img = sheet[id];
  if (!img) return false;
  ctx.drawImage(img, x, y, w, h);
  return true;
}

export function drawLobbyTilemap(
  ctx: CanvasRenderingContext2D,
  sheet: LobbyTileSheet
): void {
  const tile = GO_LOBBY_TILE;
  const cols = GO_LOBBY_WORLD.width / tile;
  const rows = Math.ceil(GO_LOBBY_WORLD.height / tile);
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const x = tx * tile;
      const y = ty * tile;
      const h = Math.min(tile, GO_LOBBY_WORLD.height - y);
      const w = Math.min(tile, GO_LOBBY_WORLD.width - x);
      drawLobbyTile(ctx, sheet, floorTileAt(tx, ty), x, y, w, h);
    }
  }
  for (const stamp of LOBBY_STAMPS) {
    stamp.cells.forEach((row, ry) => {
      row.forEach((id, rx) => {
        if (!id) return;
        drawLobbyTile(
          ctx,
          sheet,
          id,
          stamp.x + rx * tile,
          stamp.y + ry * tile
        );
      });
    });
  }
}

export async function loadLobbyTileSheet(
  load: LobbyImageLoader,
  base: string = LOBBY_TILE_BASE
): Promise<LobbyTileSheet> {
  const sheet: LobbyTileSheet = {};
  const ids = [...uniqueLobbyTileIds()];
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const img = await load(lobbyTileUrl(id, base));
      return { id, img };
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      sheet[result.value.id] = result.value.img;
    }
  }
  return sheet;
}
