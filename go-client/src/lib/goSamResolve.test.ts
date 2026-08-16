import { beforeEach, describe, expect, it, vi } from "vitest";

const fixtures = vi.hoisted(() => ({
  entry: {
    id: "pg-gomoku",
    title: "五子棋",
    source: "sampot/pg-gomoku",
    kind: "game",
    series: "精緻可玩",
    blurb: "test",
    status: "listed",
  },
  cachedFiles: { "index.html": "<main>cached</main>" },
  freshFiles: { "index.html": "<main>fresh</main>" },
  getCache: vi.fn(),
  putCache: vi.fn(),
  loadFiles: vi.fn(),
  fetchTip: vi.fn(),
  getEntry: vi.fn(),
  findBySource: vi.fn(),
}));

vi.mock("./goCatalog", () => ({
  getGoCatalogEntry: fixtures.getEntry,
  findGoCatalogBySource: fixtures.findBySource,
}));

vi.mock("./goSamOfflineCache", () => ({
  getGoSamOfflineCache: fixtures.getCache,
  putGoSamOfflineCache: fixtures.putCache,
}));

vi.mock("./samLoad", () => ({
  assertSamHasIndex: vi.fn(),
  loadSamFiles: fixtures.loadFiles,
  fetchSamTipRev: fixtures.fetchTip,
}));

describe("resolveGoSamFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtures.getEntry.mockImplementation((id: string) =>
      id === fixtures.entry.id ? fixtures.entry : undefined
    );
    fixtures.findBySource.mockImplementation((source: string) =>
      source.includes("pg-gomoku") ? fixtures.entry : undefined
    );
    fixtures.getCache.mockResolvedValue({
      source: fixtures.entry.source,
      files: fixtures.cachedFiles,
      tipRev: "sha-old",
    });
    fixtures.loadFiles.mockResolvedValue(fixtures.freshFiles);
    fixtures.putCache.mockResolvedValue(true);
    fixtures.fetchTip.mockResolvedValue("sha-new");
  });

  it("local-first reuses the pack without tip check", async () => {
    const { resolveGoSamFiles } = await import("./goSamResolve");
    const result = await resolveGoSamFiles({
      source: "sampot/pg-gomoku",
      updatePolicy: "local-first",
    });
    expect(result.origin).toBe("cache");
    expect(fixtures.fetchTip).not.toHaveBeenCalled();
    expect(fixtures.loadFiles).not.toHaveBeenCalled();
  });

  it("check-tip reuses cache when tipRev matches", async () => {
    fixtures.fetchTip.mockResolvedValue("sha-old");
    const { resolveGoSamFiles } = await import("./goSamResolve");
    const result = await resolveGoSamFiles({
      source: "sampot/pg-gomoku",
      updatePolicy: "check-tip",
    });
    expect(result.origin).toBe("cache");
    expect(fixtures.fetchTip).toHaveBeenCalled();
    expect(fixtures.loadFiles).not.toHaveBeenCalled();
  });

  it("check-tip re-downloads when local tipRev is stale or missing", async () => {
    fixtures.getCache.mockResolvedValue({
      source: fixtures.entry.source,
      files: fixtures.cachedFiles,
      tipRev: null,
    });
    const { resolveGoSamFiles } = await import("./goSamResolve");
    const result = await resolveGoSamFiles({
      source: "sampot/pg-gomoku",
      updatePolicy: "check-tip",
    });
    expect(result.origin).toBe("download");
    expect(result.files).toBe(fixtures.freshFiles);
    expect(fixtures.loadFiles).toHaveBeenCalledTimes(1);
    expect(fixtures.putCache).toHaveBeenCalledWith(
      "pg-gomoku",
      "sampot/pg-gomoku",
      fixtures.freshFiles,
      "sha-new"
    );
  });

  it("check-tip re-downloads when tip advanced", async () => {
    fixtures.fetchTip.mockResolvedValue("sha-newer");
    const { resolveGoSamFiles } = await import("./goSamResolve");
    const result = await resolveGoSamFiles({
      source: "sampot/pg-gomoku",
      updatePolicy: "check-tip",
    });
    expect(result.origin).toBe("download");
    expect(fixtures.putCache).toHaveBeenCalledWith(
      "pg-gomoku",
      "sampot/pg-gomoku",
      fixtures.freshFiles,
      "sha-newer"
    );
  });
});
