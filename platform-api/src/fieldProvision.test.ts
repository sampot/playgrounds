import { describe, expect, it } from "vitest";
import {
  createFieldProvision,
  ensureUser,
  lookupApiKey,
  redeemFieldProvision,
  type EnvStore,
} from "./auth.js";
import {
  defaultFieldOriginOrFallback,
  fieldProvisionDeepLink,
  normalizeFieldOrigin,
} from "./ids.js";

function memoryStore(): EnvStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
}

describe("normalizeFieldOrigin", () => {
  it("accepts official fields and rejects reserved", () => {
    expect(normalizeFieldOrigin("https://play.samkuo.me")).toBe(
      "https://play.samkuo.me"
    );
    expect(normalizeFieldOrigin("play.samkuo.me")).toBe("https://play.samkuo.me");
    expect(normalizeFieldOrigin("https://api.samkuo.me")).toBeNull();
    expect(normalizeFieldOrigin("https://dash.samkuo.me")).toBeNull();
    // DEC-052: `go` stays reserved but is an allowed provision target.
    expect(normalizeFieldOrigin("https://go.samkuo.me")).toBe(
      "https://go.samkuo.me"
    );
    expect(normalizeFieldOrigin("go.samkuo.me")).toBe("https://go.samkuo.me");
    expect(normalizeFieldOrigin("https://www.samkuo.me")).toBeNull();
    expect(normalizeFieldOrigin("https://docs.samkuo.me")).toBeNull();
    expect(normalizeFieldOrigin("https://old-blog.samkuo.me")).toBeNull();
    expect(normalizeFieldOrigin("http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173"
    );
    expect(normalizeFieldOrigin("localhost:5173")).toBe(
      "http://localhost:5173"
    );
    expect(normalizeFieldOrigin("http://localhost:5173")).toBe(
      "http://localhost:5173"
    );
    expect(defaultFieldOriginOrFallback(null)).toBe("https://play.samkuo.me");
  });

  it("builds provision deep link without api key", () => {
    const url = fieldProvisionDeepLink("https://play.samkuo.me", "pg_pv_abc");
    expect(url).toBe("https://play.samkuo.me/#pg_provision=pg_pv_abc");
    expect(url.includes("pg_sk_")).toBe(false);
  });

  it("builds provision deep link for go target", () => {
    const url = fieldProvisionDeepLink("https://go.samkuo.me", "pg_pv_abc");
    expect(url).toBe("https://go.samkuo.me/#pg_provision=pg_pv_abc");
  });

  it("appends a same-origin return path to the deep link", () => {
    const url = fieldProvisionDeepLink(
      "https://go.samkuo.me",
      "pg_pv_abc",
      "/s/pg-gomoku"
    );
    expect(url).toBe("https://go.samkuo.me/s/pg-gomoku#pg_provision=pg_pv_abc");
  });

  it("drops path traversal / fragment attempts from return path", () => {
    expect(
      fieldProvisionDeepLink(
        "https://go.samkuo.me",
        "pg_pv_abc",
        "https://evil.example/x"
      )
    ).toBe("https://go.samkuo.me/#pg_provision=pg_pv_abc");
    expect(
      fieldProvisionDeepLink(
        "https://go.samkuo.me",
        "pg_pv_abc",
        "/safe#fragment"
      )
    ).toBe("https://go.samkuo.me/#pg_provision=pg_pv_abc");
  });
});

describe("field provision", () => {
  it("rotates key and redeems once", async () => {
    const store = memoryStore();
    await ensureUser(store, "u1", "user");
    const a = await createFieldProvision(store, "u1", "user");
    expect(a.provisionToken.startsWith("pg_pv_")).toBe(true);

    const first = await redeemFieldProvision(store, a.provisionToken);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.apiKey.startsWith("pg_sk_")).toBe(true);
    expect(await lookupApiKey(store, first.apiKey)).not.toBeNull();

    const second = await redeemFieldProvision(store, a.provisionToken);
    expect(second).toEqual({ ok: false, error: "invalid" });
  });

  it("new provision invalidates previous token and old key", async () => {
    const store = memoryStore();
    await ensureUser(store, "u1", "user");
    const a = await createFieldProvision(store, "u1", "user");
    const redeemedA = await redeemFieldProvision(store, a.provisionToken);
    expect(redeemedA.ok).toBe(true);
    if (!redeemedA.ok) return;
    const oldKey = redeemedA.apiKey;

    const b = await createFieldProvision(store, "u1", "user");
    expect(await lookupApiKey(store, oldKey)).toBeNull();

    const againA = await redeemFieldProvision(store, a.provisionToken);
    expect(againA.ok).toBe(false);

    const redeemedB = await redeemFieldProvision(store, b.provisionToken);
    expect(redeemedB.ok).toBe(true);
    if (!redeemedB.ok) return;
    expect(await lookupApiKey(store, redeemedB.apiKey)).not.toBeNull();
  });
});
