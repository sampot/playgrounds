import { beforeEach, describe, expect, it, vi } from "vitest";

describe("goSamOfflineCache list／delete", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("lists and deletes cached catalog ids", async () => {
    const origin = "https://go.samkuo.me";
    const store = new Map<string, Response>();
    const toKey = (req: RequestInfo) => {
      if (typeof req === "string") {
        return req.startsWith("http") ? req : `${origin}${req}`;
      }
      return req.url;
    };
    const cache = {
      async put(req: RequestInfo, res: Response) {
        store.set(toKey(req), res);
      },
      async match(req: RequestInfo) {
        return store.get(toKey(req)) ?? undefined;
      },
      async delete(req: RequestInfo) {
        return store.delete(toKey(req));
      },
      async keys() {
        return [...store.keys()].map(u => new Request(u));
      },
    };
    vi.stubGlobal("caches", {
      open: async () => cache,
    });

    const {
      putGoSamOfflineCache,
      listGoSamOfflineCatalogIds,
      deleteGoSamOfflineCache,
      clearAllGoSamOfflineCache,
    } = await import("./goSamOfflineCache");

    await putGoSamOfflineCache("pg-breakout", "sampot/pg-breakout", {
      "index.html": "<html></html>",
    });
    await putGoSamOfflineCache("pg-gomoku", "sampot/pg-gomoku", {
      "index.html": "<html></html>",
    });

    const ids = await listGoSamOfflineCatalogIds();
    expect(ids).toEqual(["pg-breakout", "pg-gomoku"]);

    expect(await deleteGoSamOfflineCache("pg-breakout")).toBe(true);
    expect(await listGoSamOfflineCatalogIds()).toEqual(["pg-gomoku"]);

    expect(await clearAllGoSamOfflineCache()).toBe(1);
    expect(await listGoSamOfflineCatalogIds()).toEqual([]);

    vi.unstubAllGlobals();
  });
});
