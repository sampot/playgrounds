import { describe, expect, it, vi } from "vitest";
import {
  LOBBY_SPRITE_FILES,
  drawLobbySprite,
  loadLobbySpriteSheet,
  lobbySpriteUrl,
  lobbySpriteUrls,
  lobbySpritesReady,
} from "./goLobbyAssets";

describe("goLobbyAssets", () => {
  it("maps every sprite key to a png under /lobby", () => {
    const urls = lobbySpriteUrls();
    for (const key of Object.keys(LOBBY_SPRITE_FILES) as (keyof typeof LOBBY_SPRITE_FILES)[]) {
      expect(urls[key]).toBe(`/lobby/${LOBBY_SPRITE_FILES[key]}`);
      expect(lobbySpriteUrl(key)).toMatch(/^\/lobby\/.+\.png$/);
    }
  });

  it("requires cabinet/counter/door before ready", () => {
    expect(lobbySpritesReady({})).toBe(false);
    expect(
      lobbySpritesReady({
        cabinet: {} as CanvasImageSource,
        counter: {} as CanvasImageSource,
      })
    ).toBe(false);
    expect(
      lobbySpritesReady({
        cabinet: {} as CanvasImageSource,
        counter: {} as CanvasImageSource,
        door: {} as CanvasImageSource,
      })
    ).toBe(true);
  });

  it("drawLobbySprite no-ops when missing", () => {
    const drawImage = vi.fn();
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawLobbySprite(ctx, {}, "cabinet", 0, 0)).toBe(false);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it("drawLobbySprite draws when present", () => {
    const drawImage = vi.fn();
    const img = {} as CanvasImageSource;
    const ctx = { drawImage } as unknown as CanvasRenderingContext2D;
    expect(drawLobbySprite(ctx, { cabinet: img }, "cabinet", 8, 16, 16, 16)).toBe(
      true
    );
    expect(drawImage).toHaveBeenCalledWith(img, 8, 16, 16, 16);
  });

  it("loadLobbySpriteSheet keeps successes when one url fails", async () => {
    const sheet = await loadLobbySpriteSheet(async (url) => {
      if (url.includes("door.png")) throw new Error("missing");
      return { url } as unknown as CanvasImageSource;
    });
    expect(sheet.cabinet).toBeTruthy();
    expect(sheet.door).toBeUndefined();
    expect(lobbySpritesReady(sheet)).toBe(false);
  });
});
