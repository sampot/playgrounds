// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  BOSS_WELCOME_RECENT_KEY,
  BOSS_WELCOME_SESSION_KEY,
  GO_BOSS_WELCOMES,
  GO_BOSS_WELCOMES_OFFLINE,
  GO_BOSS_WELCOMES_SIGNED_IN,
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
  it("starts with enough general lines to avoid quick repetition", () => {
    expect(GO_BOSS_WELCOMES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(GO_BOSS_WELCOMES).size).toBe(GO_BOSS_WELCOMES.length);
  });

  it("keeps offline and signed-in subpools non-empty", () => {
    expect(GO_BOSS_WELCOMES_OFFLINE.length).toBeGreaterThanOrEqual(2);
    expect(GO_BOSS_WELCOMES_SIGNED_IN.length).toBeGreaterThanOrEqual(2);
  });

  it("excludes recently used general lines while alternatives remain", () => {
    const picked = pickBossWelcome({
      random: () => 0,
      recentIndices: [0, 1, 2],
    });

    expect(picked.index).toBe(3);
    expect(picked.text).toBe(GO_BOSS_WELCOMES[3]);
  });

  it("falls back to the whole general pool if every general line is recent", () => {
    const picked = pickBossWelcome({
      random: () => 0.999,
      recentIndices: GO_BOSS_WELCOMES.map((_, index) => index),
    });

    expect(picked.index).toBe(GO_BOSS_WELCOMES.length - 1);
  });

  it("can draw from the offline subpool when offline", () => {
    const offlineStart = GO_BOSS_WELCOMES.length;
    const picked = pickBossWelcome({
      offline: true,
      random: () => 0.999,
      recentIndices: GO_BOSS_WELCOMES.map((_, index) => index),
    });

    expect(picked.index).toBeGreaterThanOrEqual(offlineStart);
    expect(GO_BOSS_WELCOMES_OFFLINE).toContain(picked.text);
  });

  it("can draw from the signed-in subpool when signed in", () => {
    const signedStart =
      GO_BOSS_WELCOMES.length + GO_BOSS_WELCOMES_OFFLINE.length;
    const picked = pickBossWelcome({
      signedIn: true,
      random: () => 0.999,
      // Exclude general + offline so only signed-in remains attractive at high RNG.
      recentIndices: [
        ...GO_BOSS_WELCOMES.map((_, index) => index),
        ...GO_BOSS_WELCOMES_OFFLINE.map((_, index) => index + GO_BOSS_WELCOMES.length),
      ],
    });

    expect(picked.index).toBeGreaterThanOrEqual(signedStart);
    expect(GO_BOSS_WELCOMES_SIGNED_IN).toContain(picked.text);
  });

  it("offers more than one offline line when recent rotates", () => {
    const generalRecent = GO_BOSS_WELCOMES.map((_, index) => index);
    const offlineStart = GO_BOSS_WELCOMES.length;
    const first = pickBossWelcome({
      offline: true,
      random: () => 0,
      recentIndices: generalRecent,
    });
    const second = pickBossWelcome({
      offline: true,
      random: () => 0,
      recentIndices: [...generalRecent, offlineStart],
    });

    expect(GO_BOSS_WELCOMES_OFFLINE).toContain(first.text);
    expect(GO_BOSS_WELCOMES_OFFLINE).toContain(second.text);
    expect(first.text).not.toBe(second.text);
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
