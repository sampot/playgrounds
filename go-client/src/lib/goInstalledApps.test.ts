import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGoCatalogEntry } from "./goCatalog";

describe("apps page list logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("resolves cached ids to app entries with catalog titles", async () => {
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
    } = await import("./goSamOfflineCache");

    await putGoSamOfflineCache("pg-breakout", "sampot/pg-breakout", {
      "index.html": "<html></html>",
    });
    await putGoSamOfflineCache("pg-unknown", "unknown/source", {
      "index.html": "<html></html>",
    });

    const ids = await listGoSamOfflineCatalogIds();
    let apps = ids
      .map(id => ({ id, title: getGoCatalogEntry(id)?.title ?? id }))
      .filter(a => a.title.trim().length > 0);
    if (apps.length === 0) {
      apps = ids.map(id => ({ id, title: id }));
    }

    expect(apps).toEqual([
      { id: "pg-breakout", title: "打磚塊" },
      { id: "pg-unknown", title: "pg-unknown" },
    ]);

    vi.unstubAllGlobals();
  });
});
