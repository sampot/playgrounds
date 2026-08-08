import { afterEach, describe, expect, it } from "vitest";
import {
  clearGoWebKv,
  createGoWebKv,
  goStorageKeyForCatalog,
  resetGoWebKvMemoryForTests,
} from "./goWebKv";

afterEach(() => {
  resetGoWebKvMemoryForTests();
});

describe("createGoWebKv", () => {
  it("put/get/list/delete in memory when not durable", async () => {
    const kv = createGoWebKv("ephemeral:test", { durable: false });
    await kv.put("scores:v1", JSON.stringify({ bestTimeMs: 1200 }));
    expect(await kv.get("scores:v1")).toBe('{"bestTimeMs":1200}');
    const listed = await kv.list({ prefix: "scores" });
    expect(listed.keys.map(k => k.name)).toEqual(["scores:v1"]);
    await kv.delete("scores:v1");
    expect(await kv.get("scores:v1")).toBeNull();
  });

  it("isolates namespaces", async () => {
    const a = createGoWebKv(goStorageKeyForCatalog("pg-rubik"), {
      durable: false,
    });
    const b = createGoWebKv(goStorageKeyForCatalog("pg-other"), {
      durable: false,
    });
    await a.put("k", "1");
    await b.put("k", "2");
    expect(await a.get("k")).toBe("1");
    expect(await b.get("k")).toBe("2");
    await clearGoWebKv(goStorageKeyForCatalog("pg-rubik"));
    expect(await a.get("k")).toBeNull();
    expect(await b.get("k")).toBe("2");
  });
});
