import { describe, expect, it } from "vitest";
import {
  PLAYGROUNDS_PREFS_KEY,
  buildConsoleMirrorMessage,
  defaultPlaygroundsPrefs,
  patchPlaygroundsPrefs,
  readPlaygroundsPrefs,
  writePlaygroundsPrefs,
} from "./playgroundsPrefs";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("playgroundsPrefs", () => {
  it("defaults mirrorConsoleToBrowser to false", () => {
    expect(defaultPlaygroundsPrefs()).toEqual({
      mirrorConsoleToBrowser: false,
    });
    expect(readPlaygroundsPrefs(memoryStorage())).toEqual(
      defaultPlaygroundsPrefs()
    );
  });

  it("round-trips prefs", () => {
    const storage = memoryStorage();
    writePlaygroundsPrefs({ mirrorConsoleToBrowser: true }, storage);
    expect(storage.getItem(PLAYGROUNDS_PREFS_KEY)).toContain(
      "mirrorConsoleToBrowser"
    );
    expect(readPlaygroundsPrefs(storage).mirrorConsoleToBrowser).toBe(true);
  });

  it("ignores corrupt JSON and non-boolean mirror flag", () => {
    expect(
      readPlaygroundsPrefs(
        memoryStorage({ [PLAYGROUNDS_PREFS_KEY]: "{not-json" })
      ).mirrorConsoleToBrowser
    ).toBe(false);
    expect(
      readPlaygroundsPrefs(
        memoryStorage({
          [PLAYGROUNDS_PREFS_KEY]: JSON.stringify({
            mirrorConsoleToBrowser: "yes",
          }),
        })
      ).mirrorConsoleToBrowser
    ).toBe(false);
  });

  it("patches without dropping other fields", () => {
    const storage = memoryStorage();
    writePlaygroundsPrefs({ mirrorConsoleToBrowser: false }, storage);
    const next = patchPlaygroundsPrefs(
      { mirrorConsoleToBrowser: true },
      storage
    );
    expect(next.mirrorConsoleToBrowser).toBe(true);
    expect(readPlaygroundsPrefs(storage).mirrorConsoleToBrowser).toBe(true);
  });

  it("builds console mirror postMessage payload", () => {
    expect(buildConsoleMirrorMessage(true)).toEqual({
      type: "playgrounds-console-mirror",
      enabled: true,
    });
    expect(buildConsoleMirrorMessage(false).enabled).toBe(false);
  });
});
