import {
  BOOTH_DOOR,
  BOOTH_SEATS,
  BOOTH_SHELF,
  BOOTH_TV,
  type BoothRect,
} from "./goBoothLayout";
import { pointInRect } from "./goShopHotspots";

export type BoothHotspotId = "tv" | "door" | "shelf" | `seat:${number}`;

export type BoothHotspot = {
  id: BoothHotspotId;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const GO_BOOTH_HOTSPOTS: readonly BoothHotspot[] = [
  { id: "tv", label: "包廂電視", ...BOOTH_TV },
  { id: "door", label: "請人進來", ...BOOTH_DOOR },
  { id: "shelf", label: "分享區", ...BOOTH_SHELF },
  ...BOOTH_SEATS.map(
    (seat, i): BoothHotspot => ({
      id: `seat:${i}`,
      label: `座位 ${i + 1}`,
      ...seat,
    })
  ),
];

export function hitTestBoothHotspot(
  worldX: number,
  worldY: number
): BoothHotspotId | null {
  for (const spot of GO_BOOTH_HOTSPOTS) {
    if (pointInRect(worldX, worldY, spot)) return spot.id;
  }
  return null;
}

export function boothHotspotRect(id: BoothHotspotId): BoothRect | null {
  const spot = GO_BOOTH_HOTSPOTS.find((s) => s.id === id);
  return spot ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : null;
}
