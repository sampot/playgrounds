import {
  LOBBY_AD,
  LOBBY_BOSS,
  LOBBY_BULLETIN,
  LOBBY_CABINETS,
  LOBBY_CABINET_ZONE,
  LOBBY_CHAT,
  LOBBY_STORAGE,
  type LobbyRect,
} from "./goLobbyLayout";

export type ShopHotspotId =
  | "boss"
  | "bulletin"
  | "room"
  | "cabinet"
  | "storage"
  | "sfx";

export type ShopHotspot = {
  id: ShopHotspotId;
  /** Reader-facing label (a11y / hotspot nav). */
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const GO_LOBBY_WORLD = {
  width: 320,
  height: 200,
} as const;

/** Tile size for collision grid (world px). */
export const GO_LOBBY_TILE = 16;

export const GO_LOBBY_HOTSPOTS: readonly ShopHotspot[] = [
  { id: "boss", label: "櫃檯", ...LOBBY_BOSS },
  { id: "bulletin", label: "布告欄", ...LOBBY_BULLETIN },
  { id: "room", label: "包廂", ...LOBBY_CHAT },
  { id: "cabinet", label: "機台區", ...LOBBY_CABINET_ZONE },
  { id: "storage", label: "後場", ...LOBBY_STORAGE },
  { id: "sfx", label: "音效", ...LOBBY_AD },
] as const;

export const GO_LOBBY_INTERACT_RADIUS = 22;

export type GoLobbyRouteContext = {
  pathname: string;
  canvasActive: boolean;
};

/** Lobby canvas only on home `/` when not playing a SAM. */
export function shouldShowGoLobby({
  pathname,
  canvasActive,
}: GoLobbyRouteContext): boolean {
  if (canvasActive) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/";
}

export function pointInRect(
  x: number,
  y: number,
  rect: Pick<ShopHotspot, "x" | "y" | "w" | "h">
): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** Cabinet zone is a union for nav; hit-test each machine so the aisle stays floor. */
export function rectsForHotspot(spot: ShopHotspot): readonly LobbyRect[] {
  if (spot.id === "cabinet") return LOBBY_CABINETS;
  return [spot];
}

export function hitTestShopHotspot(
  worldX: number,
  worldY: number,
  hotspots: readonly ShopHotspot[] = GO_LOBBY_HOTSPOTS
): ShopHotspotId | null {
  for (let i = hotspots.length - 1; i >= 0; i -= 1) {
    const spot = hotspots[i]!;
    for (const rect of rectsForHotspot(spot)) {
      if (pointInRect(worldX, worldY, rect)) return spot.id;
    }
  }
  return null;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

/** Distance to the closest point on a rect (0 if inside). */
export function distanceToRect(
  x: number,
  y: number,
  rect: Pick<ShopHotspot, "x" | "y" | "w" | "h">
): number {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return distance(x, y, nx, ny);
}

/** Center of hotspot rect. */
export function hotspotCenter(spot: ShopHotspot): { x: number; y: number } {
  return { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2 };
}

/** Nearest hotspot whose rect is within radius of avatar (stand outside furniture). */
export function nearestShopHotspotInRange(
  avatarX: number,
  avatarY: number,
  radius: number = GO_LOBBY_INTERACT_RADIUS,
  hotspots: readonly ShopHotspot[] = GO_LOBBY_HOTSPOTS
): ShopHotspotId | null {
  let best: { id: ShopHotspotId; d: number } | null = null;
  for (const spot of hotspots) {
    for (const rect of rectsForHotspot(spot)) {
      const d = distanceToRect(avatarX, avatarY, rect);
      if (d > radius) continue;
      if (!best || d < best.d) best = { id: spot.id, d };
    }
  }
  return best?.id ?? null;
}

/** Pointer target wins; otherwise glow the furniture the avatar is standing by. */
export function lobbyPromptHotspot(args: {
  avatar: { x: number; y: number };
  hover: ShopHotspotId | null;
  radius?: number;
}): ShopHotspotId | null {
  if (args.hover) return args.hover;
  return nearestShopHotspotInRange(args.avatar.x, args.avatar.y, args.radius);
}

export function getShopHotspot(
  id: ShopHotspotId,
  hotspots: readonly ShopHotspot[] = GO_LOBBY_HOTSPOTS
): ShopHotspot | undefined {
  return hotspots.find((h) => h.id === id);
}

export type LobbyHotspotAction =
  | { type: "boss-menu" }
  | { type: "open-cabinets" }
  | { type: "open-bulletin" }
  | { type: "navigate"; href: string }
  | { type: "toggle-sfx" };

export function resolveShopHotspotAction(id: ShopHotspotId): LobbyHotspotAction {
  switch (id) {
    case "boss":
      return { type: "boss-menu" };
    case "cabinet":
      return { type: "open-cabinets" };
    case "bulletin":
      return { type: "open-bulletin" };
    case "room":
      return { type: "navigate", href: "/room" };
    case "storage":
      return { type: "navigate", href: "/apps" };
    case "sfx":
      return { type: "toggle-sfx" };
  }
}
