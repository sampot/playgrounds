import { describe, expect, it } from "vitest";
import {
  GO_AD_SLOT_NARROW,
  GO_AD_SLOT_WIDE,
  goAdsEnabled,
  goAdsProvider,
  isStandaloneDisplay,
  shouldShowGoAdSlot,
} from "./goAds";

describe("goAds", () => {
  it("defines IAB slot dimensions", () => {
    expect(GO_AD_SLOT_NARROW).toEqual({ width: 320, height: 100 });
    expect(GO_AD_SLOT_WIDE).toEqual({ width: 728, height: 90 });
  });

  it("defaults to enabled when env unset", () => {
    expect(goAdsEnabled()).toBe(true);
  });

  it("Phase 1 provider is house (standalone forces house)", () => {
    expect(goAdsProvider()).toBe("house");
    expect(goAdsProvider({ standalone: true })).toBe("house");
  });

  it("hides when canvas is active", () => {
    expect(shouldShowGoAdSlot({ canvasActive: true })).toBe(false);
    expect(shouldShowGoAdSlot({ canvasActive: false })).toBe(true);
  });

  it("detects standalone via matchMedia", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: (q: string) => ({
          matches: q.includes("standalone"),
        }),
        navigator: {},
      } as never)
    ).toBe(true);
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: { standalone: true },
      } as never)
    ).toBe(true);
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }),
        navigator: {},
      } as never)
    ).toBe(false);
  });
});
