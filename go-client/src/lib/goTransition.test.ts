// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { pixelWipe, pixelWipeOut, prefersReducedMotion } from "./goTransition";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? matches : false,
      media: query,
    }),
  });
}

function css(
  config: { css?: (t: number, u: number) => string },
  t: number
): string {
  if (!config.css) throw new Error("transition has no css()");
  return config.css(t, 1 - t);
}

afterEach(() => {
  setReducedMotion(false);
});

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("mirrors the media query result", () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("pixelWipe (intro: reveal left→right)", () => {
  const node = {} as Element;

  it("clips fully at t=0 and not at all at t=1", () => {
    setReducedMotion(false);
    const c = pixelWipe(node);
    expect(c.duration).toBeGreaterThan(0);
    expect(css(c, 0)).toContain("inset(0 100% 0 0)");
    expect(css(c, 1)).toContain("inset(0 0% 0 0)");
  });

  it("quantises progress into 8 steps", () => {
    const c = pixelWipe(node);
    // 0.51 * 8 = 4.08 → 4/8 = 0.5 → 50% remaining inset
    expect(css(c, 0.51)).toContain("inset(0 50% 0 0)");
    // 0.56 * 8 = 4.48 → 4/8 = 0.5 as well (same step bucket)
    expect(css(c, 0.56)).toContain("inset(0 50% 0 0)");
  });

  it("honours a custom step count", () => {
    const c = pixelWipe(node, { steps: 4 });
    expect(css(c, 0.3)).toContain("inset(0 75% 0 0)");
  });

  it("is a no-op when reduced motion is requested", () => {
    setReducedMotion(true);
    expect(pixelWipe(node).duration).toBe(0);
  });
});

describe("pixelWipeOut (outro: hide left→right)", () => {
  const node = {} as Element;

  it("keeps the node visible at t=1 and clips it away at t=0", () => {
    const c = pixelWipeOut(node);
    expect(c.duration).toBeGreaterThan(0);
    expect(css(c, 1)).toContain("inset(0 0 0 0%)");
    expect(css(c, 0)).toContain("inset(0 0 0 100%)");
  });

  it("clips from the left edge so the wipe continues in one direction", () => {
    const c = pixelWipeOut(node);
    expect(css(c, 0.51)).toContain("inset(0 0 0 50%)");
  });

  it("is shorter than the intro so the incoming page leads", () => {
    expect(pixelWipeOut(node).duration!).toBeLessThan(pixelWipe(node).duration!);
  });

  it("is a no-op when reduced motion is requested", () => {
    setReducedMotion(true);
    expect(pixelWipeOut(node).duration).toBe(0);
  });
});
