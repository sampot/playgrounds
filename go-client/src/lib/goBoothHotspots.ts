import {
  BOOTH_DOOR,
  BOOTH_SEATS,
  BOOTH_SHELF,
  BOOTH_TV,
  type BoothRect,
} from "./goBoothLayout";
import { pointInRect } from "./goShopHotspots";

export type BoothHotspotId = "tv" | "door" | "shelf" | `seat:${number}`;

export type BoothPanel = "tv" | "files" | "invite" | "seat" | "none";

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

/** World-px padding so a phone-landscape door still meets a 44px finger. */
export const BOOTH_HOTSPOT_HIT_SLOP = 12;
/** Minimum CSS hit box for furniture overlays. */
export const BOOTH_HOTSPOT_MIN_HIT_CSS_PX = 44;

function distToRect(
  x: number,
  y: number,
  rect: Pick<BoothHotspot, "x" | "y" | "w" | "h">
): number {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.w ? x - (rect.x + rect.w) : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.h ? y - (rect.y + rect.h) : 0;
  return Math.hypot(dx, dy);
}

export function hitTestBoothHotspot(
  worldX: number,
  worldY: number,
  slop = 0
): BoothHotspotId | null {
  for (const spot of GO_BOOTH_HOTSPOTS) {
    if (pointInRect(worldX, worldY, spot)) return spot.id;
  }
  if (slop <= 0) return null;
  let best: BoothHotspotId | null = null;
  let bestDist = Infinity;
  for (const spot of GO_BOOTH_HOTSPOTS) {
    const d = distToRect(worldX, worldY, spot);
    if (d <= slop && d < bestDist) {
      bestDist = d;
      best = spot.id;
    }
  }
  return best;
}

export type BoothHotspotScreenHit = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** CSS hit box for a furniture overlay. Door expands left so it does not cover seat 0. */
export function boothHotspotScreenHit(
  rect: Pick<BoothHotspot, "x" | "y" | "w" | "h">,
  scale: number,
  opts: {
    expand?: "left" | "right" | "center";
    canvasCssWidth: number;
    canvasCssHeight: number;
    minCssPx?: number;
  }
): BoothHotspotScreenHit {
  const minCss = opts.minCssPx ?? BOOTH_HOTSPOT_MIN_HIT_CSS_PX;
  const expand = opts.expand ?? "center";
  let left = rect.x * scale;
  let top = rect.y * scale;
  let width = rect.w * scale;
  let height = rect.h * scale;
  if (width < minCss) {
    const extra = minCss - width;
    if (expand === "left") left -= extra;
    else if (expand === "center") left -= extra / 2;
    width = minCss;
  }
  if (height < minCss) {
    const extra = minCss - height;
    top -= extra / 2;
    height = minCss;
  }
  if (left < 0) left = 0;
  if (top < 0) top = 0;
  if (left + width > opts.canvasCssWidth) {
    left = Math.max(0, opts.canvasCssWidth - width);
  }
  if (top + height > opts.canvasCssHeight) {
    top = Math.max(0, opts.canvasCssHeight - height);
  }
  width = Math.min(width, opts.canvasCssWidth);
  height = Math.min(height, opts.canvasCssHeight);
  return { left, top, width, height };
}

export function boothHotspotRect(id: BoothHotspotId): BoothRect | null {
  const spot = GO_BOOTH_HOTSPOTS.find((s) => s.id === id);
  return spot ? { x: spot.x, y: spot.y, w: spot.w, h: spot.h } : null;
}

/** Furniture click → which overlay. TV is never the share catalog or invite sheet. */
export function boothHotspotPanel(
  id: BoothHotspotId,
  opts: { role: "host" | "guest" }
): BoothPanel {
  if (id === "tv") return "tv";
  if (id === "shelf") return "files";
  if (id === "door") return opts.role === "host" ? "invite" : "none";
  if (id.startsWith("seat:")) return "seat";
  return "none";
}

export function boothSeatIndex(id: BoothHotspotId): number | null {
  if (!id.startsWith("seat:")) return null;
  const i = Number(id.slice(5));
  return Number.isFinite(i) ? i : null;
}
