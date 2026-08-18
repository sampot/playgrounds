import { describe, expect, it, vi } from "vitest";
import { LOBBY_BOSS } from "./goLobbyLayout";
import {
  bossIdlePose,
  cabinetAttractStyle,
  cabinetAttractTick,
  cabinetMarqueeLabel,
  cabinetStickOffset,
  computeLobbyCanvasLayout,
  DEFAULT_LOBBY_COLORS,
  drawLobbyFrame,
  LOBBY_ATTRACT_FRAME_MS,
  PLAYER_HAIR,
  PLAYER_HAIR_HL,
  screenToWorld,
  worldToScreen,
} from "./goShopCanvas";

function hexLuminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

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
    const fillText = vi.fn();
    const ctx = {
      clearRect: vi.fn(),
      fillRect,
      strokeRect: vi.fn(),
      fillText,
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
    return { ctx, fillRect, drawImage, fillText };
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

  it("labels the PLAY neon MUTE when sound is off", () => {
    const on = mockCtx();
    drawLobbyFrame(on.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      sfxEnabled: true,
    });
    const off = mockCtx();
    const fillText = vi.fn();
    off.ctx.fillText = fillText;
    drawLobbyFrame(off.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      sfxEnabled: false,
    });
    expect(fillText.mock.calls.some((c) => c[0] === "MUTE")).toBe(true);
    expect(fillText.mock.calls.some((c) => c[0] === "PLAY")).toBe(false);
  });

  it("uses a floor lighter than player hair so the head reads from behind", () => {
    const hair = hexLuminance(PLAYER_HAIR);
    expect(hexLuminance(DEFAULT_LOBBY_COLORS.floorA)).toBeGreaterThan(hair + 30);
    expect(hexLuminance(DEFAULT_LOBBY_COLORS.floorB)).toBeGreaterThan(hair + 30);
    expect(hexLuminance(DEFAULT_LOBBY_COLORS.aisle)).toBeGreaterThan(hair + 30);
  });

  it("paints a hair highlight when the player faces away", () => {
    const paint = (facing: "up" | "down") => {
      const fills: Array<{ color: string; y: number }> = [];
      const { ctx } = mockCtx();
      ctx.fillRect = ((x: number, y: number) => {
        fills.push({ color: String(ctx.fillStyle), y });
      }) as typeof ctx.fillRect;
      drawLobbyFrame(ctx, {
        avatar: { x: 160, y: 168 },
        nearHotspot: null,
        hoverHotspot: null,
        facing,
      });
      return fills;
    };
    const headY = 168 - 26;
    expect(
      paint("up").some((p) => p.color === PLAYER_HAIR_HL && p.y <= headY + 2)
    ).toBe(true);
    expect(
      paint("down").some((p) => p.color === PLAYER_HAIR_HL && p.y <= headY + 2)
    ).toBe(false);
  });

  it("animates cabinet attract screens when nowMs advances", () => {
    const a = mockCtx();
    drawLobbyFrame(a.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      nowMs: 0,
    });
    const b = mockCtx();
    drawLobbyFrame(b.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      nowMs: LOBBY_ATTRACT_FRAME_MS * 3,
    });
    expect(a.fillRect.mock.calls).not.toEqual(b.fillRect.mock.calls);
  });

  it("shifts the boss along the counter when idle time advances", () => {
    const shirtX = (nowMs: number) => {
      const xs: number[] = [];
      const { ctx } = mockCtx();
      ctx.fillRect = ((x: number, _y: number) => {
        if (String(ctx.fillStyle) === "#2c3a6a") xs.push(x);
      }) as typeof ctx.fillRect;
      drawLobbyFrame(ctx, {
        avatar: { x: 160, y: 168 },
        nearHotspot: null,
        hoverHotspot: null,
        nowMs,
      });
      return xs;
    };
    expect(shirtX(0).length).toBeGreaterThan(0);
    expect(shirtX(0)).not.toEqual(shirtX(2800));
  });

  it("uses series marquees and the full title only when near", () => {
    const far = mockCtx();
    drawLobbyFrame(far.ctx, {
      avatar: { x: 160, y: 168 },
      nearHotspot: null,
      hoverHotspot: null,
      cabinetTitles: ["打磚塊", "五子棋"],
      cabinetSeries: ["街機", "桌遊"],
    });
    const farLabels = far.fillText.mock.calls.map((c) => c[0]);
    expect(farLabels).toContain("街機");
    expect(farLabels).toContain("桌遊");
    expect(farLabels).not.toContain("打磚塊");

    const near = mockCtx();
    drawLobbyFrame(near.ctx, {
      avatar: { x: 30, y: 150 },
      nearHotspot: "cabinet",
      hoverHotspot: null,
      cabinetTitles: ["打磚塊", "五子棋"],
      cabinetSeries: ["街機", "桌遊"],
      activeCabinetIndex: 0,
      litCabinetIndex: 0,
    });
    const nearLabels = near.fillText.mock.calls.map((c) => c[0]);
    expect(nearLabels).toContain("打磚塊");
    expect(nearLabels).toContain("街機");
  });

  it("paints different attract screens for board and shmup series", () => {
    const styles = (series: string) => {
      const seen = new Set<string>();
      const { ctx } = mockCtx();
      ctx.fillRect = ((x: number, y: number) => {
        if (y >= 108 && y <= 124) seen.add(String(ctx.fillStyle));
      }) as typeof ctx.fillRect;
      drawLobbyFrame(ctx, {
        avatar: { x: 160, y: 168 },
        nearHotspot: null,
        hoverHotspot: null,
        cabinetSeries: [series, series, series, series],
        nowMs: 800,
      });
      return seen;
    };
    const shmup = styles("街機");
    const board = styles("桌遊");
    expect(shmup.has("#3de0ff")).toBe(true);
    expect(board.has("#d8c4a0")).toBe(true);
    expect(shmup).not.toEqual(board);
  });
});

describe("cabinetAttractTick", () => {
  it("stays on frame 0 at t=0 and advances with time", () => {
    expect(cabinetAttractTick(0, 0)).toBe(0);
    expect(cabinetAttractTick(LOBBY_ATTRACT_FRAME_MS, 0)).toBe(1);
  });

  it("offsets cabinets so demos are not in lockstep", () => {
    expect(cabinetAttractTick(0, 1)).not.toBe(cabinetAttractTick(0, 0));
  });
});

describe("cabinetAttractStyle", () => {
  it("maps catalog series to a demo loop", () => {
    expect(cabinetAttractStyle("街機")).toBe("shmup");
    expect(cabinetAttractStyle("桌遊")).toBe("board");
    expect(cabinetAttractStyle("策略")).toBe("board");
    expect(cabinetAttractStyle("機台")).toBe("wheel");
    expect(cabinetAttractStyle("懷舊")).toBe("idle");
    expect(cabinetAttractStyle("模擬")).toBe("idle");
    expect(cabinetAttractStyle("資料")).toBe("shmup");
  });
});

describe("cabinetMarqueeLabel", () => {
  it("prefers a short series over the game title", () => {
    expect(cabinetMarqueeLabel("街機")).toBe("街機");
    expect(cabinetMarqueeLabel("環境")).toBe("環境");
    expect(cabinetMarqueeLabel("")).toBe("INSERT");
    expect(cabinetMarqueeLabel(undefined)).toBe("INSERT");
  });
});

describe("cabinetStickOffset", () => {
  it("wiggles the stick across attract frames", () => {
    expect(cabinetStickOffset(0)).not.toBe(cabinetStickOffset(1));
    expect(Math.abs(cabinetStickOffset(2))).toBeLessThanOrEqual(1);
  });
});

describe("bossIdlePose", () => {
  const minX = LOBBY_BOSS.x + 14;
  const maxX = LOBBY_BOSS.x + LOBBY_BOSS.w - 14;

  it("starts idle at the home slot facing the aisle", () => {
    const pose = bossIdlePose(0);
    expect(pose.x).toBe(LOBBY_BOSS.x + 52);
    expect(pose.y).toBe(LOBBY_BOSS.y + 14);
    expect(pose.walking).toBe(false);
    expect(pose.facing).toBe("down");
  });

  it("occasionally walks but stays behind the counter", () => {
    const home = bossIdlePose(0).x;
    const samples = [0, 2700, 5000, 7100].map((t) => bossIdlePose(t));
    expect(samples.some((p) => p.x !== home)).toBe(true);
    expect(samples.some((p) => p.walking)).toBe(true);
    for (const p of samples) {
      expect(p.x).toBeGreaterThanOrEqual(minX);
      expect(p.x).toBeLessThanOrEqual(maxX);
      expect(p.y).toBe(LOBBY_BOSS.y + 14);
    }
  });
});
