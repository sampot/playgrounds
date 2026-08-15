import { describe, expect, it } from "vitest";
import {
  clearAllGoScores,
  clearGoProgressForCatalog,
  clearGoScoresForCatalog,
  goLocalStorageMirrorPrefix,
  goScorePrefixFor,
  injectGoScoreStorage,
} from "./goScoreStorage";
import { createGoWebKv, goStorageKeyForCatalog } from "./goWebKv";

describe("injectGoScoreStorage", () => {
  it("injects catalog-scoped localStorage shim once", () => {
    const html = "<!doctype html><html><head></head><body></body></html>";
    const out = injectGoScoreStorage(html, "pg-breakout");
    expect(out).toContain("data-go-score-ns");
    expect(out).toContain("pg-go-score:pg-breakout:");
    expect(injectGoScoreStorage(out, "pg-breakout")).toBe(out);
  });
});

describe("clearGoScores", () => {
  it("removes only matching catalog score keys", () => {
    const store = new Map<string, string>();
    const local = {
      get length() {
        return store.size;
      },
      key(i: number) {
        return [...store.keys()][i] ?? null;
      },
      getItem(k: string) {
        return store.has(k) ? store.get(k)! : null;
      },
      setItem(k: string, v: string) {
        store.set(k, String(v));
      },
      removeItem(k: string) {
        store.delete(k);
      },
      clear() {
        store.clear();
      },
    };
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: local,
    });

    localStorage.setItem(goScorePrefixFor("pg-breakout") + "high", "10");
    localStorage.setItem(goScorePrefixFor("pg-gomoku") + "high", "3");
    localStorage.setItem("pg_go_theme", "dark");

    expect(clearGoScoresForCatalog("pg-breakout")).toBe(1);
    expect(localStorage.getItem(goScorePrefixFor("pg-breakout") + "high")).toBe(
      null
    );
    expect(localStorage.getItem(goScorePrefixFor("pg-gomoku") + "high")).toBe(
      "3"
    );
    expect(localStorage.getItem("pg_go_theme")).toBe("dark");

    expect(clearAllGoScores()).toBe(1);
    expect(localStorage.getItem("pg_go_theme")).toBe("dark");
  });

  it("clears only pg-breakout KV and its synchronous localStorage mirror", async () => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        get length() {
          return store.size;
        },
        key(i: number) {
          return [...store.keys()][i] ?? null;
        },
        getItem(k: string) {
          return store.get(k) ?? null;
        },
        setItem(k: string, v: string) {
          store.set(k, String(v));
        },
        removeItem(k: string) {
          store.delete(k);
        },
        clear() {
          store.clear();
        },
      },
    });

    const breakout = createGoWebKv(goStorageKeyForCatalog("pg-breakout"));
    const gomoku = createGoWebKv(goStorageKeyForCatalog("pg-gomoku"));
    await breakout.put("high-score", "1200");
    await gomoku.put("high-score", "30");
    localStorage.setItem(
      goLocalStorageMirrorPrefix("pg-breakout") + "high-score",
      "1200"
    );
    localStorage.setItem(
      goLocalStorageMirrorPrefix("pg-gomoku") + "high-score",
      "30"
    );

    await clearGoProgressForCatalog("pg-breakout");

    expect(await breakout.get("high-score")).toBeNull();
    expect(await gomoku.get("high-score")).toBe("30");
    expect(
      localStorage.getItem(goLocalStorageMirrorPrefix("pg-breakout") + "high-score")
    ).toBeNull();
    expect(
      localStorage.getItem(goLocalStorageMirrorPrefix("pg-gomoku") + "high-score")
    ).toBe("30");
  });
});
