import { describe, expect, it, vi } from "vitest";
import {
  createLocalStorageShim,
  type ShimFetch,
} from "./localStorageShim";

/** Build an in-memory KV-backed fetch that mimics the host /api/kv contract. */
function makeKvFetch(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const fetchMock = vi.fn<ShimFetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const m = url.match(/\/api\/kv\/(.+)$/);
    if (m && !url.endsWith("/list")) {
      const key = decodeURIComponent(m[1]);
      if (method === "PUT") {
        store.set(key, String(init?.body ?? ""));
        return new Response(null, { status: 204 });
      }
      if (method === "DELETE") {
        store.delete(key);
        return new Response(null, { status: 204 });
      }
      const v = store.get(key);
      return v == null
        ? new Response(null, { status: 404 })
        : new Response(v, { status: 200 });
    }
    if (url.endsWith("/list")) {
      const prefix = (init?.body ? JSON.parse(init.body as string).prefix : "") ?? "";
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      return new Response(
        JSON.stringify({ keys: keys.map((name) => ({ name })), list_complete: true }),
        { status: 200 }
      );
    }
    return new Response(null, { status: 404 });
  });
  return { fetchMock, store };
}

describe("createLocalStorageShim", () => {
  it("reads/writes synchronously from in-memory cache", () => {
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    expect(shim.getItem("score")).toBeNull();
    shim.setItem("score", "1200");
    expect(shim.getItem("score")).toBe("1200");
    expect(shim.length).toBe(1);
    expect(shim.key(0)).toBe("score");
    shim.removeItem("score");
    expect(shim.getItem("score")).toBeNull();
    expect(shim.length).toBe(0);
  });

  it("maps application keys 1:1 to env.KV and starts the write immediately", async () => {
    const { fetchMock, store } = makeKvFetch();
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    shim.setItem("save", "x");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kv/save",
      expect.objectContaining({ method: "PUT", body: "x" })
    );
    await shim.flush();
    expect(store.get("save")).toBe("x");
    expect(store.has("ls:save")).toBe(false);
  });

  it("coerces non-string values like native Storage", () => {
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    // @ts-expect-error testing coercion
    shim.setItem("n", 42);
    expect(shim.getItem("n")).toBe("42");
  });

  it("clear removes every application KV key even before hydration", async () => {
    const { fetchMock, store } = makeKvFetch({ a: "1", b: "2" });
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    shim.clear();
    expect(shim.length).toBe(0);
    await shim.flush();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kv/a",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(store.size).toBe(0);
  });

  it("hydrates the whole application KV namespace without rewriting keys", async () => {
    const { fetchMock } = makeKvFetch({ best: "900", settings: "x" });
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    await shim.hydrate();
    expect(shim.getItem("best")).toBe("900");
    expect(shim.getItem("settings")).toBe("x");
    expect(shim.length).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/kv/list",
      expect.objectContaining({ body: JSON.stringify({ prefix: "" }) })
    );
  });

  it("preserves operation order while synchronizing every mutation promptly", async () => {
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
    });
    shim.setItem("k", "1");
    shim.setItem("k", "2");
    shim.removeItem("k");
    await shim.flush();
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "PUT",
      "PUT",
      "DELETE",
    ]);
    expect(fetchMock.mock.calls.map((call) => call[1]?.body)).toEqual([
      "1",
      "2",
      undefined,
    ]);
  });

  it("does not throw on fetch failure; warns instead", async () => {
    const boom = vi.fn<ShimFetch>(async () => {
      throw new Error("offline");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const shim = createLocalStorageShim({ fetch: boom, now: () => 0 });
    shim.setItem("k", "v");
    expect(() => shim.flush()).not.toThrow();
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("honors a scoped native mirror before async hydration", () => {
    const native = new Map<string, string>([
      ["__pg_kv_mirror__:catalog%3Apg-breakout:legacy", "old"],
    ]);
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      mirrorScope: "catalog:pg-breakout",
      readNative: (k) => native.get(k) ?? null,
    });
    expect(shim.getItem("legacy")).toBe("old");
  });

  it("keeps synchronous mirrors isolated between applications", () => {
    const native = new Map<string, string>();
    const putNative = (k: string, v: string) => native.set(k, v);
    const deleteNative = (k: string) => native.delete(k);
    const getNative = (k: string) => native.get(k) ?? null;
    const { fetchMock } = makeKvFetch();
    // First load: write a high score, mirror to native.
    const a = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      mirrorScope: "catalog:pg-breakout",
      readNative: getNative,
      writeNative: putNative,
      deleteNative,
    });
    a.setItem("high-score", "1500");
    a.flush();
    // Second load (simulating refresh): brand-new shim, KV not yet hydrated.
    const b = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      mirrorScope: "catalog:pg-breakout",
      readNative: getNative,
      writeNative: putNative,
      deleteNative,
    });
    // Synchronous startup read must return the persisted value, not 0/null.
    expect(b.getItem("high-score")).toBe("1500");

    const other = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      mirrorScope: "catalog:pg-gomoku",
      readNative: getNative,
      writeNative: putNative,
      deleteNative,
    });
    // Same application key is isolated by host scope, not by game-chosen prefixes.
    expect(other.getItem("high-score")).toBeNull();
  });
});
