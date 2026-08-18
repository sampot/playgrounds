import { describe, expect, it, vi } from "vitest";
import {
  computeLobbyCanvasLayout,
  drawLobbyFrame,
  screenToWorld,
  worldToScreen,
} from "./goShopCanvas";

describe("computeLobbyCanvasLayout", () => {
  it("preserves world aspect ratio", () => {
    const layout = computeLobbyCanvasLayout(400, 2);
    expect(layout.cssHeight / layout.cssWidth).toBeCloseTo(200 / 320, 5);
    expect(layout.scale).toBeCloseTo(400 / 320, 5);
  });

  it("round-trips world/screen coordinates", () => {
    const layout = computeLobbyCanvasLayout(320, 1);
    const world = screenToWorld(160, 100, layout);
    const back = worldToScreen(world.x, world.y, layout);
    expect(back.x).toBeCloseTo(160, 5);
    expect(back.y).toBeCloseTo(100, 5);
  });
});

describe("drawLobbyFrame", () => {
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
    drawLobbyFrame(ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
    });
    expect(drawImage).not.toHaveBeenCalled();
    expect(fillRect.mock.calls.length).toBeGreaterThan(20);
  });

  it("hides the boss lower body behind the counter", () => {
    const fills: Array<{ color: string; y: number }> = [];
    const { ctx } = mockCtx();
    ctx.fillRect = ((x: number, y: number, _w: number, _h: number) => {
      fills.push({ color: String(ctx.fillStyle), y });
    }) as typeof ctx.fillRect;
    drawLobbyFrame(ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
    });
    expect(fills.some((p) => p.color === "#1a2438")).toBe(false);
    expect(fills.some((p) => p.color === "#1a1420" && p.y < 80)).toBe(false);
    expect(fills.some((p) => p.color === "#2c3a6a" && p.y <= 36)).toBe(true);
  });

  it("redraws the avatar when the walk frame or facing changes", () => {
    const a = mockCtx();
    drawLobbyFrame(a.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      facing: "down",
      walking: true,
      walkFrame: 0,
    });
    const b = mockCtx();
    drawLobbyFrame(b.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      facing: "down",
      walking: true,
      walkFrame: 1,
    });
    expect(a.fillRect.mock.calls).not.toEqual(b.fillRect.mock.calls);
    const c = mockCtx();
    drawLobbyFrame(c.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      facing: "left",
      walking: true,
      walkFrame: 1,
    });
    expect(b.fillRect.mock.calls).not.toEqual(c.fillRect.mock.calls);
  });
});
