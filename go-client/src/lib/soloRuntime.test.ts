import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  entry: {
    id: "pg-breakout",
    title: "打磚塊",
    source: "sampot/pg-breakout",
    kind: "game",
    series: "街機",
    blurb: "測試小品",
    status: "listed",
  },
  cachedFiles: { "index.html": "<main>cached</main>" },
  freshFiles: { "index.html": "<main>fresh</main>" },
  resolve: vi.fn(),
  mount: vi.fn(),
}));

vi.mock("./goCatalog", () => ({
  getGoCatalogEntry: vi.fn(() => fixtures.entry),
}));

vi.mock("./goSamResolve", () => ({
  resolveGoSamFiles: fixtures.resolve,
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
    fixtures.resolve.mockResolvedValue({
      files: fixtures.cachedFiles,
      origin: "cache",
      catalogId: fixtures.entry.id,
    });
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

    expect(fixtures.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: fixtures.entry.id,
        source: fixtures.entry.source,
      })
    );
    expect(fixtures.mount).toHaveBeenCalledWith(
      fixtures.cachedFiles,
      1,
      expect.objectContaining({ catalogId: fixtures.entry.id })
    );
    expect(runtime.getStatus().phase).toBe("ready");
  });

  it("mounts freshly downloaded files when resolve returns download", async () => {
    fixtures.resolve.mockResolvedValue({
      files: fixtures.freshFiles,
      origin: "download",
      catalogId: fixtures.entry.id,
    });
    const { createSoloRuntime } = await import("./soloRuntime");
    const runtime = createSoloRuntime();

    await runtime.bootFromCatalogId(fixtures.entry.id);

    expect(fixtures.mount).toHaveBeenCalledWith(
      fixtures.freshFiles,
      1,
      expect.any(Object)
    );
  });
});
