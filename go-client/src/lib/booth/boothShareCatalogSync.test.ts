import { describe, expect, it, vi } from "vitest";
import { createBoothShareCatalogSync } from "./boothShareCatalogSync";

describe("createBoothShareCatalogSync", () => {
  it("loads files and pushes catalog entries", async () => {
    const syncCatalog = vi.fn();
    const clip = new File([new Uint8Array([1])], "clip.mp4", {
      type: "video/mp4",
    });
    const sync = createBoothShareCatalogSync({
      library: {
        supported: true,
        shareLibraryDir: async () => "/data/share",
        scan: async () => [
          {
            id: "shr_test00000001",
            relativePath: "clip.mp4",
            name: "clip.mp4",
            size: 1,
            mime: "video/mp4",
          },
        ],
        loadFile: async () => clip,
      },
      syncCatalog,
    });

    await sync.rescan();
    expect(syncCatalog).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "shr_test00000001",
        name: "clip.mp4",
        file: clip,
      }),
    ]);
    expect(await sync.shareLibraryDir()).toBe("/data/share");
  });
});
