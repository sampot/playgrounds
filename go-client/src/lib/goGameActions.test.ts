import { beforeEach, describe, expect, it, vi } from "vitest";

const offline = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  equal: vi.fn(),
}));
const samLoad = vi.hoisted(() => ({
  load: vi.fn(
    async (
      _source?: string,
      _options?: { onProgress?: (p: unknown) => void }
    ) => ({ "index.html": "<main>new</main>" })
  ),
  tip: vi.fn(async () => "tip-sha"),
}));

vi.mock("./goSamOfflineCache", () => ({
  deleteGoSamOfflineCache: vi.fn(),
  getGoSamOfflineCache: offline.get,
  putGoSamOfflineCache: offline.put,
  fileMapsEqual: offline.equal,
}));

vi.mock("./samLoad", () => ({
  loadSamFiles: samLoad.load,
  fetchSamTipRev: samLoad.tip,
}));

vi.mock("./goScoreStorage", () => ({
  clearGoProgressForCatalog: vi.fn(),
}));

describe("runUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    offline.get.mockResolvedValue(null);
    offline.put.mockResolvedValue(true);
    offline.equal.mockReturnValue(false);
    samLoad.load.mockImplementation(
      async (
        _source?: string,
        options?: { onProgress?: (p: unknown) => void }
      ) => {
        options?.onProgress?.({
          done: 1,
          total: 2,
          ratio: 0.5,
          path: "index.html",
        });
        return { "index.html": "<main>new</main>" };
      }
    );
    samLoad.tip.mockResolvedValue("tip-sha");
  });

  it("forwards download progress and reports that the game changed", async () => {
    const onProgress = vi.fn();
    const { runUpdate } = await import("./goGameActions");

    const result = await runUpdate(
      {
        id: "pg-breakout",
        title: "打磚塊",
        source: "sampot/pg-breakout",
        kind: "game",
        series: "街機",
        blurb: "測試小品",
        status: "listed",
      },
      { onProgress }
    );

    expect(onProgress).toHaveBeenCalledWith({
      done: 1,
      total: 2,
      ratio: 0.5,
      path: "index.html",
    });
    expect(result).toEqual({
      ok: true,
      changed: true,
      flash: "已下載「打磚塊」",
    });
  });

  it("reports unchanged without downloading when the cached revision matches", async () => {
    offline.get.mockResolvedValue({
      source: "sampot/pg-breakout",
      tipRev: "tip-sha",
      files: { "index.html": "<main>old</main>" },
    });
    const { runUpdate } = await import("./goGameActions");

    const result = await runUpdate({
      id: "pg-breakout",
      title: "打磚塊",
      source: "sampot/pg-breakout",
      kind: "game",
      series: "街機",
      blurb: "測試小品",
      status: "listed",
    });

    expect(samLoad.load).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      changed: false,
      flash: "「打磚塊」已是最新版本",
    });
  });

  it("reports a storage failure instead of claiming the download exists", async () => {
    offline.put.mockResolvedValue(false);
    const { runUpdate } = await import("./goGameActions");

    const result = await runUpdate({
      id: "pg-breakout",
      title: "打磚塊",
      source: "sampot/pg-breakout",
      kind: "game",
      series: "街機",
      blurb: "測試小品",
      status: "listed",
    });

    expect(result).toEqual({
      ok: false,
      changed: false,
      flash: "無法儲存「打磚塊」，請確認瀏覽器儲存空間",
    });
  });
});
