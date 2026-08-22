import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { FileMap } from "@pg/projectTypes";

vi.mock("./goCanvasSupport", () => ({
  isGoCanvasSwUsable: () => true,
}));

vi.mock("./goCanvas", () => ({
  canvasEntryUrl: (id: string, gen: number) => `/canvas/${id}/index.html?v=${gen}`,
  installGoCanvasApiListener: vi.fn(() => () => {}),
  syncGoCanvasSnapshot: vi.fn(async () => {}),
}));

vi.mock("./goMemoryCanvas", () => ({
  buildGoMemoryCanvas: vi.fn(
    (_files: FileMap, generation: number, _scope?: string, surface?: string) => ({
      srcdoc: `<html data-surface="${surface}"><body>mem-${generation}</body></html>`,
      blobUrls: [] as string[],
      generation,
    })
  ),
  installGoMemoryApiListener: vi.fn(() => () => {}),
  revokeGoMemoryBlobs: vi.fn(),
}));

import { mountGoCanvas } from "./mountGoCanvas";
import { buildGoMemoryCanvas } from "./goMemoryCanvas";
import { syncGoCanvasSnapshot } from "./goCanvas";

describe("mountGoCanvas room surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forces memory canvas for booth room (session_event postMessage path)", async () => {
    const files = { "index.html": "<html></html>" } as FileMap;
    const mounted = await mountGoCanvas(files, 3, {
      catalogId: "pg-gomoku",
      surface: "room",
    });
    expect(mounted.canvasMode).toBe("memory");
    expect(mounted.canvasSrcdoc).toContain("mem-3");
    expect(mounted.canvasUrl).toBeNull();
    expect(buildGoMemoryCanvas).toHaveBeenCalled();
    expect(syncGoCanvasSnapshot).not.toHaveBeenCalled();
  });

  it("still prefers SW for solo when SW is usable", async () => {
    const files = { "index.html": "<html></html>" } as FileMap;
    const mounted = await mountGoCanvas(files, 1, {
      catalogId: "pg-gomoku",
      surface: "solo",
    });
    expect(mounted.canvasMode).toBe("sw");
    expect(mounted.canvasUrl).toContain("/canvas/");
    expect(syncGoCanvasSnapshot).toHaveBeenCalled();
  });
});
