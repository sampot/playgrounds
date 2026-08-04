import { describe, expect, it } from "vitest";
import { measureWorkCanvasViewport } from "./canvasViewport";

describe("measureWorkCanvasViewport", () => {
  it("returns null without iframe document", () => {
    expect(measureWorkCanvasViewport(null)).toBeNull();
    expect(measureWorkCanvasViewport(undefined)).toBeNull();
  });

  it("flags overflow and clipped canvas", () => {
    const canvas = {
      tagName: "CANVAS",
      id: "game-board",
      width: 640,
      height: 640,
      clientWidth: 485,
      clientHeight: 640,
      getContext: () => ({}),
      getBoundingClientRect: () => ({
        left: 20,
        top: 200,
        right: 505,
        bottom: 840,
        width: 485,
        height: 640,
      }),
    };

    const iframe = {
      clientWidth: 525,
      clientHeight: 600,
      contentWindow: { scrollX: 0, scrollY: 0 },
      contentDocument: {
        documentElement: {
          scrollWidth: 525,
          scrollHeight: 900,
          scrollLeft: 0,
          scrollTop: 0,
        },
        body: { scrollWidth: 525, scrollHeight: 900 },
        querySelectorAll: () => [canvas],
      },
    } as unknown as HTMLIFrameElement;

    const v = measureWorkCanvasViewport(iframe);
    expect(v).toBeTruthy();
    expect(v!.overflowY).toBe(true);
    expect(v!.clipped).toBe(true);
    expect(v!.canvases[0]?.clipped).toBe(true);
    expect(v!.canvases[0]?.visibleHeightRatio).toBeLessThan(0.98);
    expect(v!.note).toMatch(/clips/i);
  });

  it("reports unclipped when canvas fits", () => {
    const canvas = {
      tagName: "CANVAS",
      id: "c",
      width: 300,
      height: 300,
      clientWidth: 300,
      clientHeight: 300,
      getContext: () => ({}),
      getBoundingClientRect: () => ({
        left: 10,
        top: 10,
        right: 310,
        bottom: 310,
        width: 300,
        height: 300,
      }),
    };
    const iframe = {
      clientWidth: 400,
      clientHeight: 400,
      contentWindow: { scrollX: 0, scrollY: 0 },
      contentDocument: {
        documentElement: {
          scrollWidth: 400,
          scrollHeight: 400,
          scrollLeft: 0,
          scrollTop: 0,
        },
        body: { scrollWidth: 400, scrollHeight: 400 },
        querySelectorAll: () => [canvas],
      },
    } as unknown as HTMLIFrameElement;

    const v = measureWorkCanvasViewport(iframe);
    expect(v!.clipped).toBe(false);
    expect(v!.canvases[0]?.clipped).toBe(false);
  });
});
