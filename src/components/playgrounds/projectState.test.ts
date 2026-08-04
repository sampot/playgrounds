import { describe, expect, it } from "vitest";
import {
  clearMockDbStore,
  createMockDb,
  resetMockDbMemoryForTests,
} from "./mockDb";
import {
  clearMockKvStore,
  createMockKvNamespace,
  resetMockKvMemoryForTests,
} from "./mockKv";
import {
  PROJECT_STATE_NONE,
  anyStateSelected,
  applyProjectState,
  collectProjectState,
  copyProjectState,
  normalizeStateParts,
} from "./projectState";
import { filesToZip, zipToFiles } from "./zipProject";
import { defaultMeta } from "./projectTypes";

describe("projectState", () => {
  it("normalizes selection and detects any; secrets always false", () => {
    expect(normalizeStateParts(undefined)).toEqual(PROJECT_STATE_NONE);
    expect(normalizeStateParts({ kv: true, secrets: true })).toEqual({
      kv: true,
      db: false,
      secrets: false,
    });
    expect(anyStateSelected(PROJECT_STATE_NONE)).toBe(false);
    expect(anyStateSelected({ kv: true, db: false, secrets: true })).toBe(true);
    expect(anyStateSelected({ kv: false, db: false, secrets: true })).toBe(
      false
    );
    expect(normalizeStateParts({ d1: true })).toEqual({
      kv: false,
      db: true,
      secrets: false,
    });
  });

  it("copies selected KV between projects; ignores secrets flag", async () => {
    resetMockKvMemoryForTests();
    await clearMockKvStore("src");
    await clearMockKvStore("dst");

    const kv = createMockKvNamespace("src");
    await kv.put("session", "abc");

    const applied = await copyProjectState("src", "dst", {
      kv: true,
      secrets: true,
    });
    expect(applied).toEqual({ kv: true, db: false, secrets: false });

    const dstKv = createMockKvNamespace("dst");
    expect(await dstKv.get("session")).toBe("abc");

    await clearMockKvStore("dst2");
    await copyProjectState("src", "dst2", { db: true });
    expect(await createMockKvNamespace("dst2").get("session")).toBeNull();
  });

  it("round-trips state inside .sam zip without polluting file tree", async () => {
    resetMockKvMemoryForTests();
    resetMockDbMemoryForTests();
    await clearMockKvStore("zip-src");
    await clearMockDbStore("zip-src");

    const kv = createMockKvNamespace("zip-src");
    await kv.put("k", "v");
    const db = createMockDb("zip-src");
    await db.exec("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);");

    const bundle = await collectProjectState("zip-src", {
      kv: true,
      db: true,
      secrets: true,
    });
    expect(bundle.secrets).toBeUndefined();
    const meta = defaultMeta("zip-src", "Demo");
    const files = { "index.html": "<!doctype html>" };
    const zip = filesToZip(files, meta, { folderName: "Demo", state: bundle });
    const restored = zipToFiles(zip);

    expect(restored.files["index.html"]).toBe("<!doctype html>");
    expect(restored.files[".playgrounds-state/manifest.json"]).toBeUndefined();
    expect(restored.state?.kv?.get("k")).toBeTruthy();
    expect(restored.state?.db?.byteLength).toBeGreaterThan(0);

    await clearMockKvStore("zip-dst");
    await clearMockDbStore("zip-dst");
    const applied = await applyProjectState("zip-dst", restored.state, {
      kv: true,
      db: true,
    });
    expect(applied.kv).toBe(true);
    expect(applied.db).toBe(true);
    expect(await createMockKvNamespace("zip-dst").get("k")).toBe("v");
  });
});
