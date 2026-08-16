import { beforeEach, describe, expect, it, vi } from "vitest";

const offline = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  equal: vi.fn(),
}));

vi.mock("./goSamOfflineCache", () => ({
  deleteGoSamOfflineCache: vi.fn(),
  getGoSamOfflineCache: offline.get,
  putGoSamOfflineCache: offline.put,
  fileMapsEqual: offline.equal,
}));

vi.mock("./samLoad", () => ({
  loadSamFiles: vi.fn(async () => ({ "index.html": "<main>new</main>" })),
  fetchSamTipRev: vi.fn(async () => "tip-sha"),
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
      flash: "無法儲存「打磚塊」的離線下載，請確認瀏覽器儲存空間",
    });
  });
});
