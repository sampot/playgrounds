import { describe, expect, it, vi } from "vitest";
import { BOOTH_TV_SCREEN, GO_BOOTH_WORLD } from "./goBoothLayout";
import {
  boothTvOverlay,
  computeBoothCanvasLayout,
  drawBoothFrame,
} from "./goBoothCanvas";

describe("computeBoothCanvasLayout", () => {
  it("preserves the booth world aspect", () => {
    const layout = computeBoothCanvasLayout(400, 2);
    expect(layout.cssHeight / layout.cssWidth).toBeCloseTo(
      GO_BOOTH_WORLD.height / GO_BOOTH_WORLD.width,
      5
    );
    expect(layout.scale).toBeCloseTo(400 / GO_BOOTH_WORLD.width, 5);
  });

  it("maps the TV hole to a CSS overlay rect", () => {
    const layout = computeBoothCanvasLayout(320, 1);
    const overlay = boothTvOverlay(layout);
    expect(overlay.left).toBeCloseTo(BOOTH_TV_SCREEN.x * layout.scale, 5);
    expect(overlay.top).toBeCloseTo(BOOTH_TV_SCREEN.y * layout.scale, 5);
    expect(overlay.width).toBeCloseTo(BOOTH_TV_SCREEN.w * layout.scale, 5);
    expect(overlay.height).toBeCloseTo(BOOTH_TV_SCREEN.h * layout.scale, 5);
  });

  it("letterboxes into a short landscape box without overflowing", () => {
    const layout = computeBoothCanvasLayout(844, 2, 280);
    expect(layout.cssHeight).toBeLessThanOrEqual(280);
    expect(layout.cssWidth).toBeLessThanOrEqual(844);
    expect(layout.cssHeight / layout.cssWidth).toBeCloseTo(
      GO_BOOTH_WORLD.height / GO_BOOTH_WORLD.width,
      2
    );
  });

  it("still fills width when height is ample", () => {
    const layout = computeBoothCanvasLayout(400, 1, 800);
    expect(layout.cssWidth).toBe(400);
    expect(layout.cssHeight).toBe(
      Math.round(400 * (GO_BOOTH_WORLD.height / GO_BOOTH_WORLD.width))
    );
  });
});

describe("drawBoothFrame", () => {
  function mockCtx() {
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const ctx = {
      clearRect: vi.fn(),
      fillRect,
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      drawImage,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      font: "",
      textAlign: "start",
    } as unknown as CanvasRenderingContext2D;
    return { ctx, fillRect, drawImage };
  }

  it("paints with canvas primitives, not images", () => {
    const { ctx, fillRect, drawImage } = mockCtx();
    drawBoothFrame(ctx, { occupants: [], hoverHotspot: null });
    expect(drawImage).not.toHaveBeenCalled();
    expect(fillRect.mock.calls.length).toBeGreaterThan(20);
  });

  it("draws a seated figure for each occupant", () => {
    const { ctx, fillRect } = mockCtx();
    drawBoothFrame(ctx, {
      occupants: [
        { peerId: "local", name: "我", mine: true, liveVideo: false, liveAudio: false },
        { peerId: "g-a", name: "小明", mine: false, liveVideo: true, liveAudio: false },
      ],
      hoverHotspot: null,
    });
    const withTwo = fillRect.mock.calls.length;
    fillRect.mockClear();
    drawBoothFrame(ctx, { occupants: [], hoverHotspot: null });
    expect(withTwo).toBeGreaterThan(fillRect.mock.calls.length);
  });
});
