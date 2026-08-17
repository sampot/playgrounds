// @vitest-environment jsdom
/**
 * PG-UI-SDK-SPEC.md §3 / §4 / §6 / §7 contract tests for the UI-side SDK.
 *
 * The SDK is a static file (public/playgrounds/sdk.js) consumed by SAM
 * canvases. It mounts `window.PG` and trivially wraps `fetch("/api/...")`.
 * We load the SDK source into jsdom by setting a global `WRITABLE_FILE` to
 * the file path and evaluating the script, then drive it with a stubbed
 * `window.fetch` and assert (a) URL/method/body shape, (b) PgError mapping,
 * (c) capability-driven attribute presence, and (d) the no-`env.*` invariant.
 *
 * Pure-Node contract assertions (no env object, no fetch redefinition) live in
 * scripts/sdk-static-check.ts and run via `npm run sdk:check`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const SDK_PATH = resolve(here, "../public/playgrounds/sdk.js");

interface Call {
  url: string;
  method: string;
  body?: string | null;
  headers?: Record<string, string>;
}

let fetchMock: ReturnType<typeof vi.fn>;
let recorded: Call[];

/**
 * Build a fetch stub that records each call and returns a programmable
 * response. Each entry in `responses` is consumed in order; extra calls
 * produce a 599 + warning so the test fails loudly.
 */
type StubEntry =
  | { status: number; body: unknown; contentType?: string };

function buildFetchStub(
  responses: Array<StubEntry | ((call: Call) => Promise<Response> | Response)>,
  options: { capabilities?: unknown; vars?: unknown } = {}
) {
  let next = 0;
  recorded = [];
  // The SDK probes /api/capabilities and /api/vars at mount time. Prepend
  // their default responses so the first user-driven call sees the first
  // caller-supplied entry.
  const bootstrap: StubEntry[] = [
    {
      status: 200,
      body:
        options.capabilities ?? {
          intrinsics: ["kv", "db", "vars"],
          bindings: [],
        },
    },
    {
      status: 200,
      body: options.vars ?? {},
    },
  ];
  const queue: Array<StubEntry | ((call: Call) => Response | Promise<Response>)> = [
    ...bootstrap,
    ...responses,
  ];
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const body =
      init?.body == null
        ? null
        : typeof init.body === "string"
          ? init.body
          : init.body instanceof URLSearchParams
            ? init.body.toString()
            : null;
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as HeadersInit;
      if (h instanceof Headers) {
        h.forEach((v, k) => (headers[k] = v));
      } else if (Array.isArray(h)) {
        for (const [k, v] of h) headers[k] = v;
      } else {
        Object.assign(headers, h as Record<string, string>);
      }
    }
    recorded.push({ url, method, body, headers });

    const cur = queue[next++];
    if (cur === undefined) {
      return new Response(
        JSON.stringify({ error: "test: unstubbed fetch", url }),
        { status: 599, headers: { "content-type": "application/json" } }
      );
    }
    if (typeof cur === "function") {
      return cur({ url, method, body, headers });
    }
    const ct = cur.contentType ?? "application/json";
    const is204 = cur.status === 204;
    const bodyText = is204
      ? null
      : typeof cur.body === "string"
        ? cur.body
        : JSON.stringify(cur.body);
    return new Response(bodyText, {
      status: cur.status,
      headers: is204 ? {} : { "content-type": ct },
    });
  });
}

function jsonResponse(call: Call): unknown {
  if (!call.body) return null;
  return JSON.parse(call.body);
}

/** Find the first recorded call whose URL (optionally method) matches. */
function findCall(
  url: string | RegExp,
  method?: string
): Call | undefined {
  return recorded.find((c) => {
    const urlOk = typeof url === "string" ? c.url === url : url.test(c.url);
    if (!urlOk) return false;
    if (method && c.method !== method) return false;
    return true;
  });
}

async function loadSdk(): Promise<void> {
  // jsdom `window.fetch` is read-only-ish; we set it via Object.defineProperty.
  Object.defineProperty(window, "fetch", {
    value: fetchMock,
    writable: true,
    configurable: true,
  });
  const src = readFileSync(SDK_PATH, "utf8");
  // The SDK is a self-invoking IIFE; eval in the jsdom window globals.
  // Use indirect eval so it runs in the global scope, not module scope.
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  // Bootstrap (capabilities + vars snapshot) is async; await the SDK's
  // ready promise so attribute presence is settled before assertions.
  const PG = (window as unknown as {
    PG?: { ready?: Promise<unknown> };
  }).PG;
  if (PG && PG.ready) await PG.ready;
}

beforeEach(() => {
  fetchMock = buildFetchStub([]);
  recorded = [];
});

afterEach(() => {
  // Reset window.PG so the next test starts clean.
  delete (window as unknown as { PG?: unknown }).PG;
});

describe("PG SDK — mount + version", () => {
  it("mounts window.PG with a version", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: { intrinsics: ["kv", "db", "vars"], bindings: [] } },
    ]);
    await loadSdk();
    expect((window as unknown as { PG: { version: string } }).PG.version).toBe(
      "1"
    );
  });
});

describe("PG.kv", () => {
  it("get encodes the key and issues GET /api/kv/<key>", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: "7", contentType: "text/plain" },
    ]);
    await loadSdk();
    const v = await (
      window as unknown as { PG: { kv: { get: (k: string) => Promise<string | null> } } }
    ).PG.kv.get("hits");
    expect(v).toBe("7");
    expect(findCall("/api/kv/hits", "GET")).toMatchObject({
      method: "GET",
      url: "/api/kv/hits",
    });
  });

  it("get returns null for a 404 with code not_found", async () => {
    fetchMock = buildFetchStub([
      { status: 404, body: { code: "not_found", message: "missing" } },
    ]);
    await loadSdk();
    const v = await (
      window as unknown as { PG: { kv: { get: (k: string) => Promise<string | null> } } }
    ).PG.kv.get("nope");
    expect(v).toBeNull();
  });

  it("get URL-encodes unsafe keys", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: "ok", contentType: "text/plain" },
    ]);
    await loadSdk();
    await (
      window as unknown as { PG: { kv: { get: (k: string) => Promise<string | null> } } }
    ).PG.kv.get("user:42/v 1");
    expect(findCall("/api/kv/user%3A42%2Fv%201", "GET")?.url).toBe(
      "/api/kv/user%3A42%2Fv%201"
    );
  });

  it("put sends PUT with body and optional expirationTtl via ?ttl=", async () => {
    fetchMock = buildFetchStub([
      { status: 204, body: null },
    ]);
    await loadSdk();
    await (
      window as unknown as {
        PG: {
          kv: {
            put: (
              k: string,
              v: string,
              o?: { expirationTtl?: number }
            ) => Promise<void>;
          };
        };
      }
    ).PG.kv.put("hits", "9", { expirationTtl: 60 });
    expect(findCall("/api/kv/hits?ttl=60", "PUT")).toMatchObject({
      method: "PUT",
      url: "/api/kv/hits?ttl=60",
      body: "9",
    });
  });

  it("delete sends DELETE", async () => {
    fetchMock = buildFetchStub([{ status: 204, body: null }]);
    await loadSdk();
    await (
      window as unknown as { PG: { kv: { delete: (k: string) => Promise<void> } } }
    ).PG.kv.delete("hits");
    expect(findCall("/api/kv/hits", "DELETE")).toMatchObject({
      method: "DELETE",
      url: "/api/kv/hits",
    });
  });

  it("list POSTs JSON to /api/kv/list with prefix/cursor/limit", async () => {
    fetchMock = buildFetchStub([
      {
        status: 200,
        body: { keys: [{ name: "user:1" }], list_complete: true },
      },
    ]);
    await loadSdk();
    const out = await (
      window as unknown as {
        PG: {
          kv: {
            list: (o: {
              prefix?: string;
              cursor?: string;
              limit?: number;
            }) => Promise<{ keys: Array<{ name: string }>; list_complete: boolean }>;
          };
        };
      }
    ).PG.kv.list({ prefix: "user:", limit: 50 });
    expect(out.list_complete).toBe(true);
    expect(findCall("/api/kv/list", "POST")).toMatchObject({
      method: "POST",
      url: "/api/kv/list",
    });
    expect(jsonResponse(findCall("/api/kv/list", "POST")!)).toEqual({
      prefix: "user:",
      cursor: undefined,
      limit: 50,
    });
  });
});

describe("PG.db", () => {
  it("prepare()...all() issues POST /api/db/prepare with method=all", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: { rows: [{ id: 1, name: "a" }], meta: { durationMs: 1 } } },
    ]);
    await loadSdk();
    const rows = await (
      window as unknown as {
        PG: {
          db: {
            prepare: (sql: string) => {
              bind: (...args: unknown[]) => {
                all: <T = unknown>() => Promise<T[]>;
              };
            };
          };
        };
      }
    ).PG.db.prepare("SELECT * FROM t WHERE id = ?").bind(1).all();
    expect(rows).toEqual([{ id: 1, name: "a" }]);
    expect(findCall("/api/db/prepare", "POST")?.url).toBe("/api/db/prepare");
    expect(jsonResponse(findCall("/api/db/prepare", "POST")!)).toEqual({
      sql: "SELECT * FROM t WHERE id = ?",
      bind: [1],
      method: "all",
    });
  });

  it.each(["all", "first", "run", "raw"] as const)(
    "prepare().bind().%s() sends method=%s",
    async (m) => {
      fetchMock = buildFetchStub([
        {
          status: 200,
          body:
            m === "all" || m === "raw"
              ? { rows: [] }
              : m === "first"
                ? { rows: [null] }
                : { rows: [], meta: { changes: 0 } },
        },
      ]);
      await loadSdk();
      const stmt = (
        window as unknown as {
          PG: {
            db: {
              prepare: (sql: string) => {
                bind: (...args: unknown[]) => Record<string, () => Promise<never>>;
              };
            };
          };
        }
      ).PG.db.prepare("SELECT 1").bind();
      await stmt[m]();
      expect(jsonResponse(findCall("/api/db/prepare", "POST")!)).toMatchObject({
        method: m,
      });
    }
  );

  it("exec posts raw SQL to /api/db/exec", async () => {
    fetchMock = buildFetchStub([{ status: 204, body: null }]);
    await loadSdk();
    await (
      window as unknown as {
        PG: { db: { exec: (sql: string) => Promise<void> } };
      }
    ).PG.db.exec("CREATE TABLE x (id INT)");
    expect(findCall("/api/db/exec", "POST")).toMatchObject({
      method: "POST",
      url: "/api/db/exec",
    });
    expect(jsonResponse(findCall("/api/db/exec", "POST")!)).toEqual({
      sql: "CREATE TABLE x (id INT)",
    });
  });

  it("batch posts statements to /api/db/batch", async () => {
    fetchMock = buildFetchStub([{ status: 200, body: { rows: [] } }]);
    await loadSdk();
    await (
      window as unknown as {
        PG: { db: { batch: (s: unknown[]) => Promise<unknown> } };
      }
    ).PG.db.batch([{ sql: "INSERT 1" }]);
    expect(findCall("/api/db/batch", "POST")).toMatchObject({
      method: "POST",
      url: "/api/db/batch",
    });
  });
});

describe("PG.vars (synchronous snapshot)", () => {
  it("exposes a snapshot from GET /api/vars at mount time", async () => {
    fetchMock = buildFetchStub([], {
      vars: { GREETING: "hi", FEATURE_FLAG: "1" },
    });
    await loadSdk();
    const PG = (
      window as unknown as {
        PG: {
          vars: Record<string, string | undefined> & {
            keys: () => ReadonlyArray<string>;
            has: (k: string) => boolean;
          };
        };
      }
    ).PG;
    expect(PG.vars.GREETING).toBe("hi");
    expect(PG.vars.has("GREETING")).toBe(true);
    expect(PG.vars.has("MISSING")).toBe(false);
    expect(PG.vars.MISSING).toBeUndefined();
    expect(PG.vars.keys().slice().sort()).toEqual(["FEATURE_FLAG", "GREETING"]);
    // Snapshot is taken once: subsequent fetches must not re-hit /api/vars.
    const after = recorded.length;
    void PG.vars.keys();
    expect(recorded.length).toBe(after);
  });

  it("loads /api/vars only once across mount", async () => {
    fetchMock = buildFetchStub([], { vars: { A: "1" } });
    await loadSdk();
    await (
      window as unknown as { PG: { capabilities: () => Promise<unknown> } }
    ).PG.capabilities();
    const varsCalls = recorded.filter((c) => c.url === "/api/vars").length;
    expect(varsCalls).toBe(1);
  });
});

describe("PG capabilities", () => {
  it("attributes for unadmitted capabilities are absent (use `in`)", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const PG = (
      window as unknown as {
        PG: Record<string, unknown> & {
          capabilities: () => Promise<ReadonlyArray<string>>;
        };
      }
    ).PG;
    const caps = await PG.capabilities();
    expect(caps).toEqual(["kv", "db", "vars"]);
    expect("HOST" in PG).toBe(false);
    expect("SESSION" in PG).toBe(false);
    expect("COMPUTE" in PG).toBe(false);
    expect("DELEGATE" in PG).toBe(false);
  });

  it("admitted bindings (SESSION, COMPUTE, DELEGATE, HOST) attach as properties", async () => {
    fetchMock = buildFetchStub([], {
      capabilities: {
        intrinsics: ["kv", "db", "vars"],
        bindings: ["session", "compute", "host"],
      },
    });
    await loadSdk();
    const PG = (
      window as unknown as { PG: Record<string, unknown> }
    ).PG;
    expect("SESSION" in PG).toBe(true);
    expect("COMPUTE" in PG).toBe(true);
    expect("HOST" in PG).toBe(true);
    expect("DELEGATE" in PG).toBe(false);
  });
});

describe("PgError", () => {
  it("translates 4xx/5xx with JSON {code} into a thrown PgError", async () => {
    fetchMock = buildFetchStub([
      {
        status: 400,
        body: {
          code: "db_sql_error",
          message: "syntax error",
          upstream: { message: "near X" },
        },
      },
    ]);
    await loadSdk();
    await expect(
      (
        window as unknown as {
          PG: { db: { exec: (sql: string) => Promise<void> } };
        }
      ).PG.db.exec("BROKEN")
    ).rejects.toMatchObject({
      name: "PgError",
      code: "db_sql_error",
      status: 400,
      upstream: { message: "near X" },
    });
  });

  it("falls back to internal_error when no code is provided", async () => {
    fetchMock = buildFetchStub([
      { status: 500, body: { message: "boom" } },
    ]);
    await loadSdk();
    await expect(
      (
        window as unknown as {
          PG: { kv: { get: (k: string) => Promise<string | null> } };
        }
      ).PG.kv.get("x")
    ).rejects.toMatchObject({
      code: "internal_error",
      status: 500,
    });
  });
});

describe("PG.fetch escape hatch", () => {
  it("forwards to window.fetch verbatim (caller picks the path)", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: { ok: true } },
    ]);
    await loadSdk();
    const res = await (
      window as unknown as {
        PG: { fetch: (p: string, i?: RequestInit) => Promise<Response> };
      }
    ).PG.fetch("/api/my-thing", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true });
    const last = recorded[recorded.length - 1];
    expect(last).toMatchObject({
      method: "POST",
      url: "/api/my-thing",
    });
  });
});

type PgLibsSurface = {
  list: () => Promise<
    Array<{ id: string; version: string; kind?: string; label?: string }>
  >;
  load: (id: string) => Promise<unknown>;
};

function installScriptLoadStub(opts: {
  onAppend?: (script: HTMLScriptElement) => void;
  globalName?: string;
  globalValue?: unknown;
  fail?: boolean;
}): () => void {
  const head = document.head ?? document.documentElement;
  const originalAppend = head.appendChild.bind(head);
  head.appendChild = ((node: Node) => {
    if (node instanceof HTMLScriptElement) {
      const script = node;
      opts.onAppend?.(script);
      queueMicrotask(() => {
        if (opts.fail) {
          const err = new Event("error");
          if (typeof script.onerror === "function") {
            script.onerror(err as ErrorEvent);
          }
          script.dispatchEvent(err);
          return;
        }
        if (opts.globalName) {
          (window as unknown as Record<string, unknown>)[opts.globalName] =
            opts.globalValue ?? { __stub: opts.globalName };
        }
        const load = new Event("load");
        if (typeof script.onload === "function") {
          script.onload(load);
        }
        script.dispatchEvent(load);
      });
      return node;
    }
    return originalAppend(node);
  }) as typeof head.appendChild;
  return () => {
    head.appendChild = originalAppend;
  };
}

describe("PG.libs (PG-LIBS-SPEC)", () => {
  let restoreCreate: (() => void) | undefined;

  afterEach(() => {
    restoreCreate?.();
    restoreCreate = undefined;
    delete (window as unknown as { Phaser?: unknown }).Phaser;
    delete (window as unknown as { Matter?: unknown }).Matter;
    delete (window as unknown as { Howler?: unknown }).Howler;
    delete (Math as unknown as { seedrandom?: unknown }).seedrandom;
  });

  it("mounts libs as an intrinsic with list/load", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    expect(PG.libs).toBeDefined();
    expect(typeof PG.libs.list).toBe("function");
    expect(typeof PG.libs.load).toBe("function");
  });

  it("list() returns pinned libs without requesting /playgrounds/libs/", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const before = recorded.length;
    const list = await (
      window as unknown as { PG: { libs: PgLibsSurface } }
    ).PG.libs.list();
    expect(list.length).toBe(9);
    expect(list.map((e) => e.id).sort()).toEqual([
      "howler",
      "matter",
      "nipple",
      "phaser",
      "pixi",
      "planck",
      "seedrandom",
      "three",
      "tone",
    ]);
    const phaser = list.find((e) => e.id === "phaser");
    expect(phaser?.version).toMatch(/^\d+\.\d+\.\d+/u);
    expect(phaser?.kind).toBe("engine");
    expect(list.find((e) => e.id === "matter")?.kind).toBe("physics");
    expect(list.find((e) => e.id === "howler")?.kind).toBe("audio");
    expect(list.find((e) => e.id === "three")?.kind).toBe("other");
    const afterLibs = recorded.slice(before);
    expect(afterLibs.every((c) => !c.url.includes("/playgrounds/libs/"))).toBe(
      true,
    );
  });

  it("load(unknown) rejects with unknown_lib and does not inject a script", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    let appended = 0;
    restoreCreate = installScriptLoadStub({
      onAppend: () => {
        appended += 1;
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    await expect(PG.libs.load("nope")).rejects.toMatchObject({
      name: "PgError",
      code: "unknown_lib",
    });
    await expect(
      PG.libs.load("https://evil.example/x.js" as unknown as string),
    ).rejects.toMatchObject({
      name: "PgError",
      code: "unknown_lib",
    });
    expect(appended).toBe(0);
  });

  it("load(phaser) injects /playgrounds/libs/phaser-*.min.js and returns global", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const stubPhaser = { Game: function Game() {} };
    let src = "";
    restoreCreate = installScriptLoadStub({
      globalName: "Phaser",
      globalValue: stubPhaser,
      onAppend: (script) => {
        src = script.src;
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    const mod = await PG.libs.load("phaser");
    expect(src).toMatch(/\/playgrounds\/libs\/phaser-\d+\.\d+\.\d+\.min\.js$/u);
    expect(mod).toBe(stubPhaser);
  });

  it("load(matter) and load(howler) inject matching paths", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const srcs: string[] = [];
    restoreCreate = installScriptLoadStub({
      onAppend: (script) => {
        srcs.push(script.src);
        const id = script.getAttribute("data-pg-lib");
        if (id === "matter") {
          (window as unknown as { Matter: unknown }).Matter = { Engine: {} };
        }
        if (id === "howler") {
          (window as unknown as { Howler: unknown }).Howler = { mute: () => {} };
        }
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    const Matter = await PG.libs.load("matter");
    const Howler = await PG.libs.load("howler");
    expect(srcs.some((s) => /\/matter-0\.20\.0\.min\.js$/u.test(s))).toBe(true);
    expect(srcs.some((s) => /\/howler-2\.2\.4\.min\.js$/u.test(s))).toBe(true);
    expect(Matter).toEqual({ Engine: {} });
    expect(Howler).toEqual({ mute: expect.any(Function) });
  });

  it("load(three) uses ESM import and does not inject a script tag", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    let appended = 0;
    restoreCreate = installScriptLoadStub({
      onAppend: () => {
        appended += 1;
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    // jsdom cannot fetch /playgrounds/libs/* → load_failed; still must not use <script>.
    await expect(PG.libs.load("three")).rejects.toMatchObject({
      name: "PgError",
      code: "load_failed",
    });
    expect(appended).toBe(0);
  });

  it("load(seedrandom) reads Math.seedrandom after script load", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    const stub = function seedrandom() {
      return 0.5;
    };
    restoreCreate = installScriptLoadStub({
      onAppend: () => {
        (Math as unknown as { seedrandom: unknown }).seedrandom = stub;
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    const fn = await PG.libs.load("seedrandom");
    expect(fn).toBe(stub);
  });

  it("load(phaser) is idempotent — second call reuses the module without a second script", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    let appended = 0;
    restoreCreate = installScriptLoadStub({
      globalName: "Phaser",
      globalValue: { once: true },
      onAppend: () => {
        appended += 1;
      },
    });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    const a = await PG.libs.load("phaser");
    const b = await PG.libs.load("phaser");
    expect(a).toBe(b);
    expect(appended).toBe(1);
  });

  it("load_failed when script errors; a later load can retry", async () => {
    fetchMock = buildFetchStub([]);
    await loadSdk();
    restoreCreate = installScriptLoadStub({ fail: true });
    const PG = (window as unknown as { PG: { libs: PgLibsSurface } }).PG;
    await expect(PG.libs.load("phaser")).rejects.toMatchObject({
      name: "PgError",
      code: "load_failed",
    });
    restoreCreate();
    restoreCreate = installScriptLoadStub({
      globalName: "Phaser",
      globalValue: { recovered: true },
    });
    const mod = await PG.libs.load("phaser");
    expect(mod).toEqual({ recovered: true });
  });
});

describe("contract invariants", () => {
  it("never redefines window.fetch (CANVAS_BRIDGE owns the rewrite)", async () => {
    fetchMock = buildFetchStub([
      { status: 200, body: { intrinsics: ["kv", "db", "vars"], bindings: [] } },
    ]);
    await loadSdk();
    expect(window.fetch).toBe(fetchMock);
  });

  it("never references env.* in the loaded source", async () => {
    const src = readFileSync(SDK_PATH, "utf8");
    expect(src).not.toMatch(/\benv\.(KV|DB|HOST|SESSION|COMPUTE|DELEGATE|vars|secrets)\b/);
    expect(src).not.toMatch(/secrets\[.*\]\.get\s*\(/);
  });
});
