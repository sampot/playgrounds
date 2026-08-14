import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  goBrowserSupports,
  goBrowserUnsupportedMessage,
  isGoCanvasSwUsable,
  likelyInAppBrowser,
} from "./goCanvasSupport";

function setGlobal(name: string, value: unknown) {
  (globalThis as Record<string, unknown>)[name] = value;
}

function clearGlobal(name: string) {
  delete (globalThis as Record<string, unknown>)[name];
}

function withServiceWorker(usable: boolean) {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: usable
      ? {
          register: () => {},
          addEventListener: () => {},
          ready: Promise.resolve({}),
        }
      : undefined,
  });
}

describe("goCanvasSupport", () => {
  beforeEach(() => {
    setGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    setGlobal("indexedDB", {});
    setGlobal("WebAssembly", { instantiate: () => {} });
    withServiceWorker(true);
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isGoCanvasSwUsable", () => {
    it("returns true for a well-formed navigator.serviceWorker", () => {
      withServiceWorker(true);
      expect(isGoCanvasSwUsable()).toBe(true);
    });

    it("returns false when serviceWorker is absent", () => {
      withServiceWorker(false);
      expect(isGoCanvasSwUsable()).toBe(false);
    });
  });

  describe("goBrowserSupports", () => {
    it("reports supported when all APIs present", () => {
      const r = goBrowserSupports();
      expect(r.supported).toBe(true);
      expect(r.missing).toEqual([]);
    });

    it("flags missing localStorage", () => {
      clearGlobal("localStorage");
      const r = goBrowserSupports();
      expect(r.supported).toBe(false);
      expect(r.missing).toContain("localStorage");
    });

    it("flags missing IndexedDB", () => {
      clearGlobal("indexedDB");
      const r = goBrowserSupports();
      expect(r.supported).toBe(false);
      expect(r.missing).toContain("indexedDB");
    });

    it("flags missing WebAssembly", () => {
      clearGlobal("WebAssembly");
      const r = goBrowserSupports();
      expect(r.supported).toBe(false);
      expect(r.missing).toContain("webassembly");
    });

    it("flags missing serviceWorker", () => {
      withServiceWorker(false);
      const r = goBrowserSupports();
      expect(r.supported).toBe(false);
      expect(r.missing).toContain("serviceWorker");
    });
  });

  describe("goBrowserUnsupportedMessage", () => {
    it("returns null when supported", () => {
      expect(goBrowserUnsupportedMessage(goBrowserSupports())).toBeNull();
    });

    it("mentions the missing feature and system-browser guidance", () => {
      clearGlobal("localStorage");
      const msg = goBrowserUnsupportedMessage(goBrowserSupports());
      expect(msg).not.toBeNull();
      expect(msg).toContain("localStorage");
      expect(msg).toContain("Safari");
    });

    it("gives in-app browser guidance for in-app browsers", () => {
      vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
        "Mozilla/5.0 (Linux; Android 10) Line/10.0"
      );
      expect(likelyInAppBrowser()).toBe(true);
      withServiceWorker(false);
      const msg = goBrowserUnsupportedMessage(goBrowserSupports());
      expect(msg).not.toBeNull();
      expect(msg).toContain("App 內建瀏覽器");
    });
  });
});
