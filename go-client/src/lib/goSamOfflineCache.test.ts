import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileMap } from "@pg/projectTypes";

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

  it("reports when an offline download cannot be stored", async () => {
    vi.stubGlobal("caches", {
      open: async () => ({
        put: async () => {
          throw new Error("quota exceeded");
        },
      }),
    });

    const { putGoSamOfflineCache } = await import("./goSamOfflineCache");

    await expect(
      putGoSamOfflineCache("pg-breakout", "sampot/pg-breakout", {
        "index.html": "<html></html>",
      })
    ).resolves.toBe(false);

    vi.unstubAllGlobals();
  });
});

describe("fileMapsEqual", () => {
  it("returns true for identical maps", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "index.html": "<html>", "style.css": "body {}" } as FileMap;
    const b = { "index.html": "<html>", "style.css": "body {}" } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(true);
  });

  it("returns false for different text content", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "index.html": "<html>" } as FileMap;
    const b = { "index.html": "<body>" } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(false);
  });

  it("returns false for different keys", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "index.html": "<html>" } as FileMap;
    const b = { "about.html": "<html>" } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(false);
  });

  it("returns false for different lengths", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "index.html": "<html>" } as FileMap;
    const b = { "index.html": "<html>", "style.css": "body {}" } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(false);
  });

  it("compares binary content", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "img.png": new Uint8Array([1, 2, 3]) } as FileMap;
    const b = { "img.png": new Uint8Array([1, 2, 3]) } as FileMap;
    const c = { "img.png": new Uint8Array([1, 2, 4]) } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(true);
    expect(fileMapsEqual(a, c)).toBe(false);
  });

  it("returns false for mixed text/binary mismatch", async () => {
    const { fileMapsEqual } = await import("./goSamOfflineCache");
    const a = { "file": "<html>" } as FileMap;
    const b = {
      "file": new Uint8Array([60, 104, 116, 109, 108, 62]),
    } as FileMap;
    expect(fileMapsEqual(a, b)).toBe(false);
  });
});
