import { describe, expect, it } from "vitest";
import {
  clearMockKvStore,
  createMockKvNamespace,
  mockKvStoreSize,
  resetMockKvMemoryForTests,
} from "./mockKv";
import { createFunctionsEnv } from "./functionsEnv";

describe("createMockKvNamespace", () => {
  it("puts and gets text / json", async () => {
    resetMockKvMemoryForTests();
    await clearMockKvStore("p1");
    const kv = createMockKvNamespace("p1");
    await kv.put("greeting", "hello");
    expect(await kv.get("greeting")).toBe("hello");
    await kv.put("obj", JSON.stringify({ n: 2 }));
    expect(await kv.get("obj", "json")).toEqual({ n: 2 });
  });

  it("isolates projects and supports list/delete", async () => {
    resetMockKvMemoryForTests();
    await clearMockKvStore("a");
    await clearMockKvStore("b");
    const a = createMockKvNamespace("a");
    const b = createMockKvNamespace("b");
    await a.put("x", "1");
    await b.put("x", "2");
    expect(await a.get("x")).toBe("1");
    expect(await b.get("x")).toBe("2");

    await a.put("y", "y");
    const listed = await a.list({ prefix: "" });
    expect(listed.keys.map(k => k.name).sort()).toEqual(["x", "y"]);
    await a.delete("x");
    expect(await a.get("x")).toBeNull();
    expect(mockKvStoreSize("a")).toBe(1);
  });

  it("createFunctionsEnv exposes KV", () => {
    const env = createFunctionsEnv("env-test");
    expect(env.KV).toBeDefined();
    expect(typeof (env.KV as { get: unknown }).get).toBe("function");
  });
});
