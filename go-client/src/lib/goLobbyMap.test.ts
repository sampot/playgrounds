import { describe, expect, it, vi } from "vitest";
import { GO_LOBBY_TILE, GO_LOBBY_WORLD } from "./goShopHotspots";
import {
  LOBBY_FLOOR_TILES,
  LOBBY_STAMPS,
  drawLobbyTile,
  drawLobbyTilemap,
  floorTileAt,
  lobbyTileFile,
  lobbyTileUrl,
  lobbyTilesReady,
  uniqueLobbyTileIds,
  type LobbyTileSheet,
} from "./goLobbyMap";

describe("goLobbyMap", () => {
  it("maps tile ids to /lobby/tiles files", () => {
    expect(lobbyTileFile("r00_c16")).toBe("r00_c16.png");
    expect(lobbyTileUrl("r00_c16")).toBe("/lobby/tiles/r00_c16.png");
  });

  it("covers the world with a 16px floor grid", () => {
    expect(GO_LOBBY_WORLD.width % GO_LOBBY_TILE).toBe(0);
    const cols = GO_LOBBY_WORLD.width / GO_LOBBY_TILE;
    const rows = Math.ceil(GO_LOBBY_WORLD.height / GO_LOBBY_TILE);
    expect(cols).toBe(20);
    expect(rows).toBe(13);
    expect(floorTileAt(0, 0)).toMatch(/^r\d{2}_c\d{2}$/);
    expect(floorTileAt(3, 6)).toBe(LOBBY_FLOOR_TILES.walkway);
  });

  it("collects unique tiles from floor + stamps", () => {
    const ids = uniqueLobbyTileIds();
    expect(ids.has(LOBBY_FLOOR_TILES.base)).toBe(true);
    expect(ids.has(LOBBY_FLOOR_TILES.walkway)).toBe(true);
    expect(LOBBY_STAMPS.some((s) => s.hotspot === "boss")).toBe(true);
    expect(LOBBY_STAMPS.some((s) => s.hotspot === "cabinet")).toBe(true);
    for (const stamp of LOBBY_STAMPS) {
      for (const row of stamp.cells) {
        for (const id of row) {
          if (id) expect(ids.has(id)).toBe(true);
        }
      }
    }
  });

  it("is not ready until every used tile is loaded", () => {
    expect(lobbyTilesReady({})).toBe(false);
    const sheet: LobbyTileSheet = {};
    for (const id of uniqueLobbyTileIds()) {
      sheet[id] = {} as CanvasImageSource;
    }
    expect(lobbyTilesReady(sheet)).toBe(true);
  });

  it("drawLobbyTile no-ops when missing", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawLobbyTile(ctx, {}, "r00_c16", 0, 0, 16, 16)).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("paints floor cells then stamps", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    const sheet: LobbyTileSheet = {};
    const img = {} as CanvasImageSource;
    for (const id of uniqueLobbyTileIds()) sheet[id] = img;
    drawLobbyTilemap(ctx, sheet);
    expect(drawImage.mock.calls.length).toBeGreaterThan(20 * 12);
    const stampCall = drawImage.mock.calls.find(
      (c) => c[1] === LOBBY_STAMPS[0]!.x && c[2] === LOBBY_STAMPS[0]!.y
    );
    expect(stampCall).toBeTruthy();
  });
});
