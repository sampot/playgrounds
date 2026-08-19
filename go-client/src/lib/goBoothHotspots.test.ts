import { describe, expect, it } from "vitest";
import {
  BOOTH_AD_LEFT,
  BOOTH_DOOR,
  BOOTH_SEATS,
  BOOTH_SHELF,
  BOOTH_TV_SCREEN,
  GO_BOOTH_WORLD,
} from "./goBoothLayout";
import {
  BOOTH_HOTSPOT_HIT_SLOP,
  BOOTH_HOTSPOT_MIN_HIT_CSS_PX,
  GO_BOOTH_HOTSPOTS,
  boothHotspotPanel,
  boothHotspotScreenHit,
  boothSeatIndex,
  hitTestBoothHotspot,
  type BoothHotspotId,
} from "./goBoothHotspots";

describe("goBoothHotspots", () => {
  it("exposes tv, door, shelf, and six seats", () => {
    const ids = GO_BOOTH_HOTSPOTS.map((h) => h.id);
    expect(ids).toContain("tv");
    expect(ids).toContain("door");
    expect(ids).toContain("shelf");
    expect(ids.filter((id) => String(id).startsWith("seat:")).length).toBe(6);
  });

  it("hits the TV screen, door, shelf, and a seat", () => {
    expect(hitTestBoothHotspot(BOOTH_TV_SCREEN.x + 8, BOOTH_TV_SCREEN.y + 8)).toBe(
      "tv"
    );
    expect(hitTestBoothHotspot(BOOTH_DOOR.x + 4, BOOTH_DOOR.y + 8)).toBe("door");
    expect(hitTestBoothHotspot(BOOTH_SHELF.x + 4, BOOTH_SHELF.y + 8)).toBe(
      "shelf"
    );
    expect(
      hitTestBoothHotspot(BOOTH_SEATS[2]!.x + 4, BOOTH_SEATS[2]!.y + 4)
    ).toBe("seat:2");
  });

  it("returns null on empty floor", () => {
    expect(hitTestBoothHotspot(160, 140)).toBeNull();
  });

  it("does not steal furniture hits for wall ad posters", () => {
    expect(
      hitTestBoothHotspot(BOOTH_AD_LEFT.x + 4, BOOTH_AD_LEFT.y + 4)
    ).toBeNull();
    expect(GO_BOOTH_HOTSPOTS.map((h) => h.id)).not.toContain("ad");
  });

  it("prefers the TV over a seat if they ever overlap", () => {
    const id: BoothHotspotId | null = hitTestBoothHotspot(
      BOOTH_TV_SCREEN.x + BOOTH_TV_SCREEN.w / 2,
      BOOTH_TV_SCREEN.y + BOOTH_TV_SCREEN.h / 2
    );
    expect(id).toBe("tv");
  });

  it("hits the door with fat-finger slop to the left, not empty floor", () => {
    const x = BOOTH_DOOR.x - 8;
    const y = BOOTH_DOOR.y + BOOTH_DOOR.h / 2;
    expect(hitTestBoothHotspot(x, y)).toBeNull();
    expect(hitTestBoothHotspot(x, y, BOOTH_HOTSPOT_HIT_SLOP)).toBe("door");
  });

  it("does not let door slop steal a tap on seat 0", () => {
    const seat = BOOTH_SEATS[0]!;
    expect(
      hitTestBoothHotspot(
        seat.x + 4,
        seat.y + 4,
        BOOTH_HOTSPOT_HIT_SLOP
      )
    ).toBe("seat:0");
  });
});

describe("boothHotspotScreenHit", () => {
  it("expands the door to at least 44 CSS px without covering seat 0's center", () => {
    const scale = 0.84;
    const hit = boothHotspotScreenHit(BOOTH_DOOR, scale, {
      expand: "left",
      canvasCssWidth: Math.round(GO_BOOTH_WORLD.width * scale),
      canvasCssHeight: Math.round(GO_BOOTH_WORLD.height * scale),
    });
    expect(hit.width).toBeGreaterThanOrEqual(BOOTH_HOTSPOT_MIN_HIT_CSS_PX);
    expect(hit.height).toBeGreaterThanOrEqual(BOOTH_HOTSPOT_MIN_HIT_CSS_PX);
    const seatCenterX =
      (BOOTH_SEATS[0]!.x + BOOTH_SEATS[0]!.w / 2) * scale;
    expect(hit.left + hit.width).toBeLessThan(seatCenterX);
  });
});

describe("boothHotspotPanel", () => {
  it("opens the TV panel, not the share catalog or invite sheet", () => {
    expect(boothHotspotPanel("tv", { role: "host" })).toBe("tv");
    expect(boothHotspotPanel("tv", { role: "guest" })).toBe("tv");
    expect(boothHotspotPanel("shelf", { role: "host" })).toBe("files");
    expect(boothHotspotPanel("shelf", { role: "guest" })).toBe("files");
    expect(boothHotspotPanel("door", { role: "host" })).toBe("invite");
    expect(boothHotspotPanel("door", { role: "guest" })).toBe("none");
    expect(boothHotspotPanel("seat:2", { role: "host" })).toBe("seat");
    expect(boothSeatIndex("seat:2")).toBe(2);
    expect(boothSeatIndex("tv")).toBeNull();
  });
});
