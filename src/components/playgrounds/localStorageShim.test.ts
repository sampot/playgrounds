import { describe, expect, it, vi } from "vitest";
import {
  createLocalStorageShim,
  type ShimFetch,
  type ShimNow,
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

  it("namespaces keys under ls: prefix on the wire", async () => {
    const { fetchMock, store } = makeKvFetch();
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    shim.setItem("save", "x");
    await shim.flush();
    const putCall = fetchMock.mock.calls.find((c) => c[1]?.method === "PUT");
    expect(putCall?.[0]).toContain("/api/kv/ls%3Asave");
    expect(store.has("ls:save")).toBe(true);
  });

  it("coerces non-string values like native Storage", () => {
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    // @ts-expect-error testing coercion
    shim.setItem("n", 42);
    expect(shim.getItem("n")).toBe("42");
  });

  it("clears cache and schedules KV deletes for ls: keys", async () => {
    const { fetchMock, store } = makeKvFetch({ "ls:a": "1", "ls:b": "2", "other": "3" });
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    // hydrate so length reflects KV
    await shim.hydrate();
    shim.clear();
    expect(shim.length).toBe(0);
    await shim.flush();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/kv/ls%3Aa"),
      expect.objectContaining({ method: "DELETE" })
    );
    expect(store.get("other")).toBe("3");
  });

  it("hydrates in-memory cache from /api/kv/list (ls: prefix)", async () => {
    const { fetchMock } = makeKvFetch({ "ls:best": "900", "foreign": "x" });
    const shim = createLocalStorageShim({ fetch: fetchMock, now: () => 0 });
    await shim.hydrate();
    expect(shim.getItem("best")).toBe("900");
    expect(shim.getItem("foreign")).toBeNull();
    expect(shim.length).toBe(1);
  });

  it("debounces background PUTs within the flush window", async () => {
    const { fetchMock } = makeKvFetch();
    let t = 0;
    const now: ShimNow = () => t;
    const shim = createLocalStorageShim({
      fetch: fetchMock,
      now,
      flushMs: 100,
    });
    shim.setItem("k", "1");
    shim.setItem("k", "2");
    shim.setItem("k", "3");
    // before window: no PUT yet
    expect(fetchMock).not.toHaveBeenCalled();
    t = 150;
    shim.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const put = fetchMock.mock.calls[0];
    expect(put[0]).toContain("/api/kv/ls%3Ak");
    expect(put[1]?.body).toBe("3");
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

  it("honors a pre-existing native value for the same key before hydrate", () => {
    const native = new Map<string, string>([["ls:legacy", "old"]]);
    const { fetchMock } = makeKvFetch();
    const shim = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      readNative: (k) => native.get(k) ?? null,
    });
    // before hydrate, getItem falls back to native ls: keys
    expect(shim.getItem("legacy")).toBe("old");
  });

  it("mirrors writes to native localStorage so a fresh shim reads them synchronously (no reset to 0 on refresh)", () => {
    const native = new Map<string, string>();
    const putNative = (k: string, v: string) => {
      // empty string signals deletion (mirrors removeItem/clear)
      if (v === "") native.delete(k);
      else native.set(k, v);
    };
    const getNative = (k: string) => native.get(k) ?? null;
    const { fetchMock } = makeKvFetch();
    // First load: write a high score, mirror to native.
    const a = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      readNative: getNative,
      writeNative: putNative,
    });
    a.setItem("high-score", "1500");
    a.flush();
    // Second load (simulating refresh): brand-new shim, KV not yet hydrated.
    const b = createLocalStorageShim({
      fetch: fetchMock,
      now: () => 0,
      readNative: getNative,
      writeNative: putNative,
    });
    // Synchronous startup read must return the persisted value, not 0/null.
    expect(b.getItem("high-score")).toBe("1500");
  });
});
