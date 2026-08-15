// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BOSS_WELCOME_RECENT_KEY,
  BOSS_WELCOME_SESSION_KEY,
  GO_BOSS_WELCOMES,
  claimBossWelcome,
  pickBossWelcome,
  readRecentBossWelcomes,
  rememberBossWelcome,
} from "./goBossWelcome";

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("boss welcome copy", () => {
  it("starts with enough lines to avoid quick repetition", () => {
    expect(GO_BOSS_WELCOMES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(GO_BOSS_WELCOMES).size).toBe(GO_BOSS_WELCOMES.length);
  });

  it("excludes recently used lines while alternatives remain", () => {
    const picked = pickBossWelcome({
      random: () => 0,
      recentIndices: [0, 1, 2],
    });

    expect(picked.index).toBe(3);
    expect(picked.text).toBe(GO_BOSS_WELCOMES[3]);
  });

  it("falls back to the whole pool if every line is recent", () => {
    const picked = pickBossWelcome({
      random: () => 0.999,
      recentIndices: GO_BOSS_WELCOMES.map((_, index) => index),
    });

    expect(picked.index).toBe(GO_BOSS_WELCOMES.length - 1);
  });
});

describe("boss welcome storage", () => {
  it("claims only the first homepage welcome in a tab session", () => {
    expect(claimBossWelcome(sessionStorage)).toBe(true);
    expect(sessionStorage.getItem(BOSS_WELCOME_SESSION_KEY)).toBe("1");
    expect(claimBossWelcome(sessionStorage)).toBe(false);
  });

  it("keeps only the three most recent valid indices", () => {
    rememberBossWelcome(localStorage, 1);
    rememberBossWelcome(localStorage, 2);
    rememberBossWelcome(localStorage, 3);
    rememberBossWelcome(localStorage, 4);

    expect(readRecentBossWelcomes(localStorage)).toEqual([2, 3, 4]);
    expect(JSON.parse(localStorage.getItem(BOSS_WELCOME_RECENT_KEY) || "[]")).toEqual([
      2, 3, 4,
    ]);
  });

  it("ignores malformed and out-of-range recent history", () => {
    localStorage.setItem(BOSS_WELCOME_RECENT_KEY, JSON.stringify([-1, 0, "1", 999]));
    expect(readRecentBossWelcomes(localStorage)).toEqual([0]);

    localStorage.setItem(BOSS_WELCOME_RECENT_KEY, "not json");
    expect(readRecentBossWelcomes(localStorage)).toEqual([]);
  });
});
