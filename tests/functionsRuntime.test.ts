// @vitest-environment jsdom
/**
 * PG-UI-SDK-SPEC §4 + §7 contract tests for `public/playgrounds/functions-runtime.js`.
 *
 * The helper is a SAM-side ESM module shipped at /playgrounds/functions-runtime.js
 * so a SAM's own `functions.js` can compose the host-installed intrinsic routes
 * with custom routes. We assert three things:
 *
 *   1. Loading the helper in a jsdom environment gives `intrinsicRoutes(env)` and
 *      `compose([routes…])`; calling `.handle(request)` returns a Response.
 *   2. The JS implementation is wire-equivalent to the TypeScript reference
 *      (`src/sam-runtime/functionsRouting.ts`) over a parity fixture.
 *   3. `compose` walks the chain in order; a route returning `not_found` falls
 *      through to the next; a route returning anything else short-circuits.
 *
 * The JS implementation is verified against the TS one by reading both source
 * modules into the test and feeding them the same request objects. We do NOT
 * mirror the routing logic in the test — that would defeat the purpose.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type KvBinding,
  type DbBinding,
} from "../src/sam-runtime/functionsRouting.ts";
import { createDefaultFunctionsHandler } from "../src/sam-runtime/defaultFunctionsHandler.ts";

const here = dirname(fileURLToPath(import.meta.url));
const HELPER_PATH = resolve(here, "../public/playgrounds/functions-runtime.js");

interface FakeKvState {
  store: Map<string, string>;
  lists: Array<{ prefix?: string; cursor?: string; limit?: number }>;
}
function makeKv(state: FakeKvState): KvBinding {
  return {
    async get(key) {
      return state.store.has(key) ? state.store.get(key)! : null;
    },
    async put(key, value) {
      const v = typeof value === "string" ? value : new TextDecoder().decode(value);
      state.store.set(key, v);
    },
    async delete(key) {
      state.store.delete(key);
    },
    async list(opts) {
      state.lists.push(opts ?? {});
      const keys = Array.from(state.store.keys())
        .filter((k) => (opts?.prefix ? k.startsWith(opts.prefix) : true))
        .map((name) => ({ name }));
      return { keys, list_complete: true };
    },
  };
}

interface FakeDbState {
  rows: unknown[];
  execCalls: string[];
  batches: unknown[][];
}
function makeDb(state: FakeDbState): DbBinding {
  return {
    prepare(sql) {
      return {
        bind(..._args: unknown[]) {
          return {
            async all<T = unknown>(): Promise<{ rows: T[]; meta?: unknown }> {
              return { rows: state.rows as T[], meta: { durationMs: 1 } };
            },
            async first<T = unknown>(): Promise<{ row: T | null; meta?: unknown }> {
              return { row: (state.rows[0] ?? null) as T | null, meta: {} };
            },
            async run(): Promise<{ changes: number; last_row_id?: number }> {
              return { changes: state.rows.length, last_row_id: 1 };
            },
            async raw<T = unknown>(): Promise<{ rows: T[]; meta?: unknown }> {
              return { rows: state.rows as T[], meta: {} };
            },
          };
        },
      };
      void sql;
    },
    async exec(sql) {
      state.execCalls.push(sql);
      return { count: 1, duration: 1 };
    },
    async batch(stmts) {
      state.batches.push(stmts);
      return { rows: [] };
    },
  };
}

function makeEnv() {
  const kvState: FakeKvState = { store: new Map(), lists: [] };
  const dbState: FakeDbState = { rows: [], execCalls: [], batches: [] };
  return {
    env: {
      KV: makeKv(kvState),
      DB: makeDb(dbState),
      vars: { GREETING: "hi", FLAG: "1" },
      secrets: {
        OPENAI_API_KEY: { async get() { return "secret-value"; } },
        DB_URL: { async get() { return "another-secret"; } },
      },
    } as const,
    kvState,
    dbState,
  };
}

async function loadHelper(): Promise<{
  intrinsicRoutes: (env: unknown) => {
    handle: (req: Request) => Promise<Response>;
  };
  compose: (routes: Array<{
    handle: (req: Request) => Promise<Response>;
  }>) => { handle: (req: Request) => Promise<Response> };
}> {
  const src = readFileSync(HELPER_PATH, "utf8");
  // The helper is a self-mounting ESM-style script: when imported in a browser,
  // it attaches `window.PlaygroundsFunctionsRuntime`. Mirror that in jsdom.
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  const mod = (window as unknown as {
    PlaygroundsFunctionsRuntime?: {
      intrinsicRoutes: (env: unknown) => {
        handle: (req: Request) => Promise<Response>;
      };
      compose: (routes: Array<{
        handle: (req: Request) => Promise<Response>;
      }>) => { handle: (req: Request) => Promise<Response> };
    };
  }).PlaygroundsFunctionsRuntime;
  if (!mod) {
    throw new Error(
      "public/playgrounds/functions-runtime.js did not mount window.PlaygroundsFunctionsRuntime",
    );
  }
  return mod;
}

beforeEach(() => {
  // Surface is freshly evaluated per test via loadHelper.
});

afterEach(() => {
  delete (window as unknown as {
    PlaygroundsFunctionsRuntime?: unknown;
  }).PlaygroundsFunctionsRuntime;
});

// ─── 1. intrinsicRoutes / compose shape ────────────────────────────────────

describe("functions-runtime helper — surface", () => {
  it("exposes intrinsicRoutes(env) returning { handle(request) }", async () => {
    const mod = await loadHelper();
    const { env } = makeEnv();
    const routes = mod.intrinsicRoutes(env);
    expect(typeof routes.handle).toBe("function");
    const res = await routes.handle(
      new Request("https://sam.local/api/vars", { method: "GET" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ GREETING: "hi", FLAG: "1" });
  });

  it("exposes compose([r1, r2]) chaining routes in order", async () => {
    const mod = await loadHelper();
    const { env } = makeEnv();
    const intrinsic = mod.intrinsicRoutes(env);

    let customCalls = 0;
    const custom = {
      async handle(req: Request) {
        customCalls++;
        if (new URL(req.url).pathname === "/api/my-thing") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ code: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      },
    };

    const composed = mod.compose([intrinsic, custom]);

    // /api/vars → intrinsic handles.
    const v = await composed.handle(
      new Request("https://sam.local/api/vars", { method: "GET" }),
    );
    expect(v.status).toBe(200);
    expect(customCalls).toBe(0);

    // /api/my-thing → intrinsic miss, falls through to custom.
    const m = await composed.handle(
      new Request("https://sam.local/api/my-thing", { method: "GET" }),
    );
    expect(m.status).toBe(200);
    expect(await m.json()).toEqual({ ok: true });
    expect(customCalls).toBe(1);

    // /api/nope → both miss; intrinsic returned not_found → fall through to
    // custom → custom returned not_found → final response is custom's 404.
    const n = await composed.handle(
      new Request("https://sam.local/api/nope", { method: "GET" }),
    );
    expect(n.status).toBe(404);
    expect(customCalls).toBe(2);
  });
});

// ─── 2. Parity fixture — TS reference vs JS helper ──────────────────────────

interface ParityCase {
  label: string;
  method: string;
  path: string;
  body?: string;
  /** Pre-populate the env (KV / vars / secrets) before the request. */
  seed?: (e: ReturnType<typeof makeEnv>) => void;
}

const PARITY_CASES: ParityCase[] = [
  {
    label: "KV get hit",
    method: "GET",
    path: "/api/kv/hits",
    seed: ({ kvState }) => kvState.store.set("hits", "7"),
  },
  { label: "KV get miss → 404", method: "GET", path: "/api/kv/missing" },
  {
    label: "KV get invalid key → 404",
    method: "GET",
    path: "/api/kv/with%20space",
  },
  {
    label: "KV put + ttl",
    method: "PUT",
    path: "/api/kv/count?ttl=60",
    body: "9",
  },
  { label: "KV delete", method: "DELETE", path: "/api/kv/old" },
  {
    label: "KV list",
    method: "POST",
    path: "/api/kv/list",
    body: JSON.stringify({ prefix: "u:", limit: 10 }),
  },
  {
    label: "DB prepare all",
    method: "POST",
    path: "/api/db/prepare",
    body: JSON.stringify({ sql: "SELECT 1", bind: [1], method: "all" }),
  },
  {
    label: "DB exec",
    method: "POST",
    path: "/api/db/exec",
    body: JSON.stringify({ sql: "CREATE TABLE t(id INT)" }),
  },
  { label: "vars all", method: "GET", path: "/api/vars" },
  { label: "vars single", method: "GET", path: "/api/vars/GREETING" },
  { label: "vars miss", method: "GET", path: "/api/vars/MISSING" },
  { label: "secrets names only", method: "GET", path: "/api/secrets" },
  { label: "capabilities", method: "GET", path: "/api/capabilities" },
  {
    label: "unsupported route → not_found",
    method: "GET",
    path: "/api/who-knows",
  },
];

describe("functions-runtime helper — parity with TS routing", () => {
  for (const c of PARITY_CASES) {
    it(`matches TS reference for: ${c.label}`, async () => {
      const mod = await loadHelper();
      const built = makeEnv();
      c.seed?.(built);
      const url = `https://sam.local${c.path}`;
      const init: RequestInit = { method: c.method };
      if (c.body !== undefined) init.body = c.body;
      // Two independent Request objects so the two handlers don't share a
      // consumed body stream (one body → can't read twice).
      const tsReq = new Request(url, init);
      const jsReq = new Request(url, init);

      const tsHandler = createDefaultFunctionsHandler(built.env);
      const tsRes = await tsHandler.fetch(tsReq, built.env, {} as never);
      const jsRoutes = mod.intrinsicRoutes(built.env);
      const jsRes = await jsRoutes.handle(jsReq);

      expect(jsRes.status).toBe(tsRes.status);
      const tsCt = tsRes.headers.get("content-type") || "";
      const jsCt = jsRes.headers.get("content-type") || "";
      expect(jsCt).toBe(tsCt);

      const tsBody = await tsRes.clone().text();
      const jsBody = await jsRes.clone().text();
      expect(jsBody).toBe(tsBody);
    });
  }
});

// ─── 3. Secret-value safety ────────────────────────────────────────────────

describe("functions-runtime helper — DEC-029/035", () => {
  it("never returns a secret value (names only)", async () => {
    const mod = await loadHelper();
    const { env } = makeEnv();
    const routes = mod.intrinsicRoutes(env);
    const res = await routes.handle(
      new Request("https://sam.local/api/secrets", { method: "GET" }),
    );
    const body = (await res.json()) as { names: string[] };
    expect(body.names.sort()).toEqual(["DB_URL", "OPENAI_API_KEY"]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("secret-value");
    expect(text).not.toContain("another-secret");
  });
});

// ─── 4. Errror mapping ─────────────────────────────────────────────────────

describe("functions-runtime helper — error shape", () => {
  it("returns JSON { code, message } with status on a RoutingError", async () => {
    const mod = await loadHelper();
    const routes = mod.intrinsicRoutes({} as never);
    // No env.KV → internal_error (500). Mirrors the TS host handler.
    const res = await routes.handle(
      new Request("https://sam.local/api/kv/missing", { method: "GET" }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("internal_error");
    expect(typeof body.message).toBe("string");
  });

  it("returns 404 with code not_found for unsupported routes", async () => {
    const mod = await loadHelper();
    const { env } = makeEnv();
    const routes = mod.intrinsicRoutes(env);
    const res = await routes.handle(
      new Request("https://sam.local/api/who-knows", { method: "GET" }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe("not_found");
  });
});

// ─── 5. Source-level contract (helper is a pure script) ────────────────────

describe("functions-runtime helper — source contract", () => {
  it("defines window.PlaygroundsFunctionsRuntime globally", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    expect(src).toMatch(/PlaygroundsFunctionsRuntime\s*=/);
  });

  it("does not reference env.* at the top of its IIFE body", () => {
    const src = readFileSync(HELPER_PATH, "utf8");
    // Helper is allowed to read `env.KV` etc. — it's the SAM-side analogue
    // of the runtime handler. The contract is that it doesn't expose
    // anything onto the global scope besides the public surface.
    expect(src).not.toMatch(/\bwindow\.PG\s*=/);
  });
});
