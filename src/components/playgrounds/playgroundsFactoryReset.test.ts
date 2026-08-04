import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAYGROUNDS_LOCAL_STORAGE_KEYS,
  PLAYGROUNDS_OPFS_ROOTS,
  PLAYGROUNDS_SESSION_STORAGE_KEYS,
  resetPlaygroundsToFirstVisit,
} from "./playgroundsFactoryReset";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
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
      map.set(key, String(value));
    },
  };
}

function createMockOpfsRoot(existing: Set<string>) {
  return {
    async removeEntry(name: string, opts?: { recursive?: boolean }) {
      void opts;
      if (!existing.has(name)) {
        const err = new Error("not found");
        err.name = "NotFoundError";
        throw err;
      }
      existing.delete(name);
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("playgroundsFactoryReset lists", () => {
  it("includes all known OPFS roots", () => {
    expect(PLAYGROUNDS_OPFS_ROOTS).toEqual(
      expect.arrayContaining([
        "playgrounds-projects",
        "playgrounds-kv",
        "playgrounds-db",
        "playgrounds-secret-store",
        "playgrounds-checkpoints",
        "playgrounds-agent-runtime",
        "web-ide-projects",
        "playgrounds-d1",
        "playgrounds-secrets",
      ])
    );
    expect(new Set(PLAYGROUNDS_OPFS_ROOTS).size).toBe(
      PLAYGROUNDS_OPFS_ROOTS.length
    );
  });

  it("includes prefs, active slots, and legacy layout keys", () => {
    expect(PLAYGROUNDS_LOCAL_STORAGE_KEYS).toEqual(
      expect.arrayContaining([
        "playgrounds-prefs-v1",
        "playgrounds-layout",
        "ide-layout",
        "playgrounds-files-sidebar",
        "ide-files-sidebar",
        "playgrounds-play-welcome-v2",
        "playgrounds-active-project",
        "playgrounds-active-agent",
        "playgrounds-tool-prefs-v1",
        "playgrounds-coding-worker-byok",
      ])
    );
    expect(PLAYGROUNDS_SESSION_STORAGE_KEYS).toContain(
      "playgrounds-agent-runtime-peer"
    );
  });
});

describe("resetPlaygroundsToFirstVisit", () => {
  let local: Storage;
  let session: Storage;
  let existing: Set<string>;

  beforeEach(() => {
    local = createMemoryStorage();
    session = createMemoryStorage();
    existing = new Set([
      "playgrounds-projects",
      "playgrounds-kv",
      "playgrounds-secret-store",
    ]);
    local.setItem("playgrounds-prefs-v1", "{}");
    local.setItem("playgrounds-active-agent", "abc");
    local.setItem("unrelated-key", "keep");
    session.setItem("playgrounds-agent-runtime-peer", "peer-1");
    session.setItem("other-session", "keep");
  });

  it("removes present OPFS roots and clears Playgrounds storage keys", async () => {
    const result = await resetPlaygroundsToFirstVisit({
      getDirectory: async () => createMockOpfsRoot(existing),
      localStorage: local,
      sessionStorage: session,
      clearRuntimeMemory: false,
      releaseRuntimes: false,
    });

    expect(result.removedOpfsRoots).toEqual(
      expect.arrayContaining([
        "playgrounds-projects",
        "playgrounds-kv",
        "playgrounds-secret-store",
      ])
    );
    expect(result.missingOpfsRoots).toContain("playgrounds-db");
    expect(existing.size).toBe(0);

    expect(local.getItem("playgrounds-prefs-v1")).toBeNull();
    expect(local.getItem("playgrounds-active-agent")).toBeNull();
    expect(local.getItem("unrelated-key")).toBe("keep");
    expect(session.getItem("playgrounds-agent-runtime-peer")).toBeNull();
    expect(session.getItem("other-session")).toBe("keep");
  });

  it("aborts when an OPFS remove fails for a reason other than missing", async () => {
    const root = {
      async removeEntry(name: string) {
        if (name === "playgrounds-kv") {
          throw new Error("quota exceeded");
        }
        if (!existing.has(name)) {
          const err = new Error("not found");
          err.name = "NotFoundError";
          throw err;
        }
        existing.delete(name);
      },
    } as unknown as FileSystemDirectoryHandle;

    await expect(
      resetPlaygroundsToFirstVisit({
        getDirectory: async () => root,
        localStorage: local,
        sessionStorage: session,
        clearRuntimeMemory: false,
        releaseRuntimes: false,
      })
    ).rejects.toThrow(/quota exceeded/);

    // Stopped mid-loop: kv still present; Storage keys not cleared after throw.
    expect(existing.has("playgrounds-kv")).toBe(true);
    expect(local.getItem("playgrounds-prefs-v1")).toBe("{}");
  });
});

describe("resetPlaygroundsToFirstVisit without OPFS handle", () => {
  it("clears storage keys even if getDirectory is not provided and navigator lacks storage", async () => {
    const local = createMemoryStorage();
    local.setItem("playgrounds-active-project", "x");
    const session = createMemoryStorage();
    session.setItem("playgrounds-agent-runtime-peer", "y");

    const nav = globalThis.navigator;
    vi.stubGlobal("navigator", { storage: undefined });

    try {
      const result = await resetPlaygroundsToFirstVisit({
        localStorage: local,
        sessionStorage: session,
        clearRuntimeMemory: false,
        releaseRuntimes: false,
      });
      expect(result.removedOpfsRoots).toEqual([]);
      expect(local.getItem("playgrounds-active-project")).toBeNull();
      expect(session.getItem("playgrounds-agent-runtime-peer")).toBeNull();
    } finally {
      vi.stubGlobal("navigator", nav);
    }
  });
});
