/** Lobby canvas sprite catalog — ComfyUI-generated files under `static/lobby/`. */

export const LOBBY_ASSET_BASE = "/lobby";

export const LOBBY_SPRITE_FILES = {
  cabinet: "cabinet.png",
  cabinetB: "cabinet_b.png",
  counter: "counter.png",
  bulletin: "bulletin.png",
  help: "help.png",
  door: "door.png",
  ad: "ad.png",
  avatar: "avatar.png",
} as const;

export type LobbySpriteKey = keyof typeof LOBBY_SPRITE_FILES;

export type LobbySpriteSheet = Partial<
  Record<LobbySpriteKey, CanvasImageSource>
>;

/** Enough furniture to replace procedural hotspot fills. */
export const LOBBY_SPRITE_CORE: readonly LobbySpriteKey[] = [
  "cabinet",
  "counter",
  "door",
] as const;

export function lobbySpriteUrl(
  key: LobbySpriteKey,
  base: string = LOBBY_ASSET_BASE
): string {
  return `${base.replace(/\/$/, "")}/${LOBBY_SPRITE_FILES[key]}`;
}

export function lobbySpriteUrls(
  base: string = LOBBY_ASSET_BASE
): Record<LobbySpriteKey, string> {
  const out = {} as Record<LobbySpriteKey, string>;
  for (const key of Object.keys(LOBBY_SPRITE_FILES) as LobbySpriteKey[]) {
    out[key] = lobbySpriteUrl(key, base);
  }
  return out;
}

export function lobbySpritesReady(
  sheet: LobbySpriteSheet | null | undefined
): boolean {
  if (!sheet) return false;
  return LOBBY_SPRITE_CORE.every((key) => sheet[key] != null);
}

export function drawLobbySprite(
  ctx: CanvasRenderingContext2D,
  sheet: LobbySpriteSheet,
  key: LobbySpriteKey,
  x: number,
  y: number,
  w: number = 16,
  h: number = 16
): boolean {
  const img = sheet[key];
  if (!img) return false;
  ctx.drawImage(img, x, y, w, h);
  return true;
}

export type LobbyImageLoader = (url: string) => Promise<CanvasImageSource>;

/** Load sprites; missing files are skipped so procedural draw remains the fallback. */
export async function loadLobbySpriteSheet(
  load: LobbyImageLoader,
  base: string = LOBBY_ASSET_BASE
): Promise<LobbySpriteSheet> {
  const sheet: LobbySpriteSheet = {};
  const keys = Object.keys(LOBBY_SPRITE_FILES) as LobbySpriteKey[];
  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const img = await load(lobbySpriteUrl(key, base));
      return { key, img };
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      sheet[result.value.key] = result.value.img;
    }
  }
  return sheet;
}

export function browserLobbyImageLoader(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`lobby sprite failed: ${url}`));
    img.src = url;
  });
}
