// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { goPlayIntro, GO_PLAY_INTRO_MS } from "./playIntro.svelte";

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

beforeEach(() => {
  vi.useFakeTimers();
  setReducedMotion(false);
  goPlayIntro.cancel();
});

afterEach(() => {
  goPlayIntro.cancel();
  vi.useRealTimers();
});

describe("goPlayIntro", () => {
  it("starts inactive", () => {
    expect(goPlayIntro.active).toBe(false);
  });

  it("plays the shutter for the intro duration then clears itself", () => {
    goPlayIntro.start();
    expect(goPlayIntro.active).toBe(true);
    vi.advanceTimersByTime(GO_PLAY_INTRO_MS - 1);
    expect(goPlayIntro.active).toBe(true);
    vi.advanceTimersByTime(1);
    expect(goPlayIntro.active).toBe(false);
  });

  it("restarts the timer when re-triggered mid-play", () => {
    goPlayIntro.start();
    vi.advanceTimersByTime(GO_PLAY_INTRO_MS - 10);
    goPlayIntro.start();
    vi.advanceTimersByTime(GO_PLAY_INTRO_MS - 10);
    expect(goPlayIntro.active).toBe(true);
    vi.advanceTimersByTime(10);
    expect(goPlayIntro.active).toBe(false);
  });

  it("skips entirely when reduced motion is requested", () => {
    setReducedMotion(true);
    goPlayIntro.start();
    expect(goPlayIntro.active).toBe(false);
  });

  it("cancel() stops an in-flight intro", () => {
    goPlayIntro.start();
    goPlayIntro.cancel();
    expect(goPlayIntro.active).toBe(false);
    vi.advanceTimersByTime(GO_PLAY_INTRO_MS * 2);
    expect(goPlayIntro.active).toBe(false);
  });
});
