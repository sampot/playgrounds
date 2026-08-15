import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  entry: {
    id: "pg-breakout",
    title: "打磚塊",
    source: "sampot/pg-breakout",
    kind: "game",
    series: "精緻可玩",
    blurb: "測試小品",
    status: "listed",
  },
  cachedFiles: { "index.html": "<main>cached</main>" },
  freshFiles: { "index.html": "<main>fresh</main>" },
  getCache: vi.fn(),
  putCache: vi.fn(),
  loadFiles: vi.fn(),
  mount: vi.fn(),
}));

vi.mock("./goCatalog", () => ({
  getGoCatalogEntry: vi.fn(() => fixtures.entry),
}));

vi.mock("./goSamOfflineCache", () => ({
  getGoSamOfflineCache: fixtures.getCache,
  putGoSamOfflineCache: fixtures.putCache,
}));

vi.mock("./samLoad", () => ({
  assertSamHasIndex: vi.fn(),
  loadSamFiles: fixtures.loadFiles,
}));

vi.mock("./mountGoCanvas", () => ({
  mountGoCanvas: fixtures.mount,
}));

vi.mock("./goFriendlyError", () => ({
  friendlySoloLoadError: vi.fn(() => "載入失敗"),
}));

describe("createSoloRuntime cache policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.getCache.mockResolvedValue({
      source: fixtures.entry.source,
      files: fixtures.cachedFiles,
    });
    fixtures.loadFiles.mockResolvedValue(fixtures.freshFiles);
    fixtures.putCache.mockResolvedValue(true);
    fixtures.mount.mockResolvedValue({
      sandboxId: "go-test",
      canvasMode: "memory",
      canvasUrl: null,
      canvasSrcdoc: "<html></html>",
      canvasGeneration: 1,
      dispose: vi.fn(),
    });
  });

  it("opens a downloaded game without fetching it again", async () => {
    const { createSoloRuntime } = await import("./soloRuntime");
    const runtime = createSoloRuntime();

    await runtime.bootFromCatalogId(fixtures.entry.id);

    expect(fixtures.loadFiles).not.toHaveBeenCalled();
    expect(fixtures.putCache).not.toHaveBeenCalled();
    expect(fixtures.mount).toHaveBeenCalledWith(
      fixtures.cachedFiles,
      1,
      expect.objectContaining({ catalogId: fixtures.entry.id })
    );
    expect(runtime.getStatus().phase).toBe("ready");
  });

  it("downloads again when the catalog source changed", async () => {
    fixtures.getCache.mockResolvedValue({
      source: "sampot/old-breakout",
      files: fixtures.cachedFiles,
    });
    const { createSoloRuntime } = await import("./soloRuntime");
    const runtime = createSoloRuntime();

    await runtime.bootFromCatalogId(fixtures.entry.id);

    expect(fixtures.loadFiles).toHaveBeenCalledWith(
      fixtures.entry.source,
      expect.any(Object)
    );
    expect(fixtures.putCache).toHaveBeenCalledWith(
      fixtures.entry.id,
      fixtures.entry.source,
      fixtures.freshFiles
    );
    expect(fixtures.mount).toHaveBeenCalledWith(
      fixtures.freshFiles,
      1,
      expect.any(Object)
    );
  });
});
