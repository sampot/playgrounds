import { afterEach, describe, expect, it, vi } from "vitest";
import { purgeGoServiceWorkerForDev } from "./registerGoSw";

describe("purgeGoServiceWorkerForDev", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unregisters every go SW and drops shell caches", async () => {
    const unregister = vi.fn(async () => true);
    const deleteCache = vi.fn(async () => true);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: {},
        getRegistrations: async () => [{ unregister }, { unregister }],
      },
    });
    vi.stubGlobal("caches", {
      keys: async () => ["go-shell-offline-v26", "other-cache"],
      delete: deleteCache,
    });

    expect(await purgeGoServiceWorkerForDev()).toBe(true);
    expect(unregister).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith("go-shell-offline-v26");
    expect(deleteCache).not.toHaveBeenCalledWith("other-cache");
  });

  it("returns false when nothing is registered", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        controller: null,
        getRegistrations: async () => [],
      },
    });
    expect(await purgeGoServiceWorkerForDev()).toBe(false);
  });
});