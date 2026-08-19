import { describe, expect, it } from "vitest";
import {
  BOOTH_DOOR,
  BOOTH_SEATS,
  BOOTH_SHELF,
  BOOTH_TV,
  BOOTH_TV_SCREEN,
  GO_BOOTH_WORLD,
  boothSeatCenter,
} from "./goBoothLayout";

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function rectInside(
  inner: { x: number; y: number; w: number; h: number },
  outer: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

describe("goBoothLayout", () => {
  it("matches the lobby world size so the stage can be the page body", () => {
    expect(GO_BOOTH_WORLD.width).toBe(320);
    expect(GO_BOOTH_WORLD.height).toBe(200);
  });

  it("keeps the TV screen inside the bezel and as the largest prop", () => {
    expect(rectInside(BOOTH_TV_SCREEN, BOOTH_TV)).toBe(true);
    expect(BOOTH_TV_SCREEN.w * BOOTH_TV_SCREEN.h).toBeGreaterThan(
      BOOTH_DOOR.w * BOOTH_DOOR.h
    );
    expect(BOOTH_TV_SCREEN.w * BOOTH_TV_SCREEN.h).toBeGreaterThan(
      BOOTH_SHELF.w * BOOTH_SHELF.h
    );
  });

  it("places door, shelf, and seats without overlapping the TV", () => {
    expect(rectsOverlap(BOOTH_DOOR, BOOTH_TV)).toBe(false);
    expect(rectsOverlap(BOOTH_SHELF, BOOTH_TV)).toBe(false);
    expect(BOOTH_SEATS).toHaveLength(6);
    for (const seat of BOOTH_SEATS) {
      expect(rectsOverlap(seat, BOOTH_TV)).toBe(false);
      expect(seat.y).toBeGreaterThan(BOOTH_TV.y + BOOTH_TV.h);
    }
  });

  it("centers a seat on its cushion", () => {
    const c = boothSeatCenter(0);
    expect(c.x).toBe(BOOTH_SEATS[0]!.x + BOOTH_SEATS[0]!.w / 2);
    expect(c.y).toBe(BOOTH_SEATS[0]!.y + BOOTH_SEATS[0]!.h / 2);
  });
});
