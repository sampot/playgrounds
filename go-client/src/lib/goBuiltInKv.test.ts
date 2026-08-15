/**
 * go shell-built-in /api/kv handler (goBuiltInKv.ts).
 * Mirrors field shell functionsRouting.ts; persists to goWebKv so the
 * localStorage→KV shim (high scores) survives refresh in the go shell.
 */

import { describe, expect, it } from "vitest";
import { handleGoBuiltInKv } from "./goBuiltInKv";
import { createGoWebKv, goStorageKeyForCatalog } from "./goWebKv";
import type { SerializedRequest, SerializedResponse } from "@pg/canvasSwProtocol";

function textBody(s: string): ArrayBuffer {
  const b = new TextEncoder().encode(s);
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return copy.buffer;
}

function req(
  url: string,
  method: string,
  body: ArrayBuffer | null = null,
): SerializedRequest {
  return { method, url, headers: [], body };
}

async function bodyText(r: SerializedResponse): Promise<string> {
  if (!r.body) return "";
  return new TextDecoder().decode(r.body);
}

const NS = goStorageKeyForCatalog("pg-gomoku");

async function seed(key: string, value: string) {
  const kv = createGoWebKv(NS, { durable: true });
  await kv.put(key, value);
}

describe("handleGoBuiltInKv", () => {
  it("PUT then GET round-trips through goWebKv (high-score persistence)", async () => {
    const put = await handleGoBuiltInKv(
      NS,
      req("/api/kv/high-score", "PUT", textBody("1500"))
    );
    expect(put?.status).toBe(204);
    const get = await handleGoBuiltInKv(NS, req("/api/kv/high-score", "GET"));
    expect(get?.status).toBe(200);
    expect(await bodyText(get!)).toBe("1500");
    // and it is durable in goWebKv (not lost on refresh)
    const kv = createGoWebKv(NS, { durable: true });
    expect(await kv.get("high-score")).toBe("1500");
  });

  it("GET of a missing key returns 404", async () => {
    const get = await handleGoBuiltInKv(NS, req("/api/kv/missing", "GET"));
    expect(get?.status).toBe(404);
  });

  it("DELETE removes the key", async () => {
    await seed("temp", "x");
    const del = await handleGoBuiltInKv(NS, req("/api/kv/temp", "DELETE"));
    expect(del?.status).toBe(204);
    const get = await handleGoBuiltInKv(NS, req("/api/kv/temp", "GET"));
    expect(get?.status).toBe(404);
  });

  it("POST /api/kv/list returns prefix-filtered keys", async () => {
    await seed("a", "1");
    await seed("b", "2");
    const list = await handleGoBuiltInKv(
      NS,
      req("/api/kv/list", "POST", textBody(JSON.stringify({ prefix: "" })))
    );
    expect(list?.status).toBe(200);
    const parsed = JSON.parse(await bodyText(list!));
    const names = parsed.keys.map((k: { name: string }) => k.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
  });

  it("returns null for non-KV routes (delegates to SAM functions.js)", async () => {
    const r = await handleGoBuiltInKv(NS, req("/api/session/state", "GET"));
    expect(r).toBeNull();
  });
});
