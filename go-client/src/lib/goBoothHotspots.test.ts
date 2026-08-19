import { describe, expect, it } from "vitest";
import { BOOTH_DOOR, BOOTH_SEATS, BOOTH_SHELF, BOOTH_TV_SCREEN } from "./goBoothLayout";
import {
  GO_BOOTH_HOTSPOTS,
  boothHotspotPanel,
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

  it("prefers the TV over a seat if they ever overlap", () => {
    const id: BoothHotspotId | null = hitTestBoothHotspot(
      BOOTH_TV_SCREEN.x + BOOTH_TV_SCREEN.w / 2,
      BOOTH_TV_SCREEN.y + BOOTH_TV_SCREEN.h / 2
    );
    expect(id).toBe("tv");
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
