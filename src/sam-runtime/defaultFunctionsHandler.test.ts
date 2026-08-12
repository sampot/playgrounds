import { describe, expect, it } from "vitest";
import {
  createDefaultFunctionsHandler,
  type DbBinding,
  type KvBinding,
  type SecretsNamespace,
  type VarsBinding,
} from "./defaultFunctionsHandler.ts";
import type { SamExecutionContext } from "./types.ts";

// Minimal env matching the structural interfaces. The default handler is
// decoupled from createMockKvNamespace / createMockDb so we can exercise it
// in isolation without OPFS or sql.js.
function makeEnv(): {
  env: Record<string, unknown>;
  kv: { data: Map<string, string> };
} {
  const data = new Map<string, string>();
  const kv: KvBinding = {
    async get(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    async put(key, value) {
      // Mirror createMockKvNamespace: ArrayBuffer/ArrayBufferView → UTF-8
      // bytes; strings → as-is. The default handler passes the request body
      // as an ArrayBuffer, so we decode here to keep the round-trip lossless.
      if (typeof value === "string") {
        data.set(key, value);
      } else if (value instanceof ArrayBuffer) {
        data.set(key, new TextDecoder().decode(new Uint8Array(value)));
      } else {
        const view = value as ArrayBufferView;
        data.set(
          key,
          new TextDecoder().decode(
            new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          ),
        );
      }
    },
    async delete(key) {
      data.delete(key);
    },
    async list({ prefix = "", cursor = "", limit = 100 } = {}) {
      const names = [...data.keys()]
        .filter((k) => k.startsWith(prefix))
        .sort();
      const startIdx = cursor ? names.findIndex((n) => n > cursor) : 0;
      const from = startIdx < 0 ? names.length : startIdx;
      const slice = names.slice(from, from + limit);
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: from + slice.length >= names.length,
      };
    },
  };

  const db: DbBinding & { rows: Map<string, unknown[]> } = {
    rows: new Map(),
    prepare(sql) {
      let bound: unknown[] = [];
      const exec = (method: "all" | "first" | "run" | "raw") => async () => {
        const key = `${method}::${sql}::${JSON.stringify(bound)}`;
        const rows = db.rows.get(key) ?? [];
        if (method === "run") return { changes: rows.length, last_row_id: 1 };
        if (method === "first") return { row: rows[0] ?? null };
        if (method === "raw") return { rows: rows.map((r) => Object.values(r as object)) };
        return { rows, meta: { durationMs: 1 } };
      };
      return {
        bind(...args) {
          bound = args;
          return this;
        },
        all: exec("all") as never,
        first: exec("first") as never,
        run: exec("run") as never,
        raw: exec("raw") as never,
      };
    },
    async exec() {
      return { count: 0, duration: 0 };
    },
    async batch(statements) {
      return statements;
    },
  };

  const vars: VarsBinding = Object.freeze({
    API_BASE: "https://example.invalid",
    FEATURE_X: "1",
  });

  const secrets: SecretsNamespace = Object.freeze({
    OPENAI_API_KEY: { get: async () => "sk-secret" },
    OTHER: { get: async () => "value" },
  });

  const env = { KV: kv, DB: db, vars, secrets };
  return { env, kv: { data } };
}

const ctx = {} as SamExecutionContext;

describe("createDefaultFunctionsHandler", () => {
  it("round-trips KV put/get/delete", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const base = "http://sam/api/kv";

    let res = await handler.fetch(
      new Request(`${base}/hits`, { method: "PUT", body: "3" }),
      env,
      ctx,
    );
    expect(res.status).toBe(204);

    res = await handler.fetch(new Request(`${base}/hits`), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("3");

    res = await handler.fetch(
      new Request(`${base}/hits`, { method: "DELETE" }),
      env,
      ctx,
    );
    expect(res.status).toBe(204);

    res = await handler.fetch(new Request(`${base}/hits`), env, ctx);
    expect(res.status).toBe(404);
  });

  it("lists KV keys with prefix + pagination", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const base = "http://sam/api/kv";
    for (const k of ["user:1", "user:2", "user:3", "other"]) {
      await handler.fetch(
        new Request(`${base}/${k}`, { method: "PUT", body: "x" }),
        env,
        ctx,
      );
    }

    let res = await handler.fetch(
      new Request("http://sam/api/kv/list", {
        method: "POST",
        body: JSON.stringify({ prefix: "user:" }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      keys: { name: string }[];
      list_complete: boolean;
      cursor?: string;
    };
    expect(body.keys.map((k) => k.name)).toEqual([
      "user:1",
      "user:2",
      "user:3",
    ]);
    expect(body.list_complete).toBe(true);
  });

  it("rejects KV keys with illegal characters (not_found)", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const res = await handler.fetch(
      new Request("http://sam/api/kv/has%20space"),
      env,
      ctx,
    );
    // decodeURIComponent turns "%20" into a literal space, which fails the
    // KEY_RE check → HandlerError(not_found) → 404 JSON
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_found");
  });

  it("routes DB prepare with bind + method", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const db = env["DB"] as DbBinding & { rows: Map<string, unknown[]> };
    db.rows.set('all::SELECT * FROM t WHERE id = ?::[42]', [{ id: 42, name: "x" }]);

    const res = await handler.fetch(
      new Request("http://sam/api/db/prepare", {
        method: "POST",
        body: JSON.stringify({
          sql: "SELECT * FROM t WHERE id = ?",
          bind: [42],
          method: "all",
        }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { id: number }[] };
    expect(body.rows[0]?.id).toBe(42);
  });

  it("routes DB exec and batch", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);

    const exec = await handler.fetch(
      new Request("http://sam/api/db/exec", {
        method: "POST",
        body: JSON.stringify({ sql: "CREATE TABLE t (id INT)" }),
      }),
      env,
      ctx,
    );
    expect(exec.status).toBe(200);

    const batch = await handler.fetch(
      new Request("http://sam/api/db/batch", {
        method: "POST",
        body: JSON.stringify({ statements: ["a", "b"] }),
      }),
      env,
      ctx,
    );
    expect(batch.status).toBe(200);
  });

  it("returns db_sql_error when SQL is missing", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const res = await handler.fetch(
      new Request("http://sam/api/db/prepare", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("db_sql_error");
  });

  it("reads vars synchronously and lists all", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);

    const all = await handler.fetch(
      new Request("http://sam/api/vars"),
      env,
      ctx,
    );
    expect(all.status).toBe(200);
    const obj = (await all.json()) as Record<string, string>;
    expect(obj["API_BASE"]).toBe("https://example.invalid");
    expect(obj["FEATURE_X"]).toBe("1");

    const one = await handler.fetch(
      new Request("http://sam/api/vars/API_BASE"),
      env,
      ctx,
    );
    expect(one.status).toBe(200);
    expect(await one.text()).toBe("https://example.invalid");

    const missing = await handler.fetch(
      new Request("http://sam/api/vars/NOPE"),
      env,
      ctx,
    );
    expect(missing.status).toBe(404);
  });

  it("lists secret names only — never values", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const res = await handler.fetch(
      new Request("http://sam/api/secrets"),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { names: string[] };
    expect(body.names.sort()).toEqual(["OPENAI_API_KEY", "OTHER"]);
    // Critical: the response body must not contain the secret values.
    const text = await (await handler.fetch(
      new Request("http://sam/api/secrets"),
      env,
      ctx,
    )).text();
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("value");
  });

  it("returns capabilities with intrinsics + bindings", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const res = await handler.fetch(
      new Request("http://sam/api/capabilities"),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      intrinsics: string[];
      bindings: string[];
    };
    expect(body.intrinsics.sort()).toEqual(["db", "kv", "vars"]);
    expect(body.bindings).toEqual([]);
  });

  it("404 for unsupported routes", async () => {
    const { env } = makeEnv();
    const handler = createDefaultFunctionsHandler(env);
    const res = await handler.fetch(
      new Request("http://sam/api/unknown"),
      env,
      ctx,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("not_found");
  });

  it("reads env lazily via the getter form", async () => {
    const { env: initial } = makeEnv();
    let liveEnv = { KV: undefined as unknown };
    const handler = createDefaultFunctionsHandler(() => liveEnv);

    // First fetch: no KV → internal_error
    let res = await handler.fetch(
      new Request("http://sam/api/kv/x"),
      initial,
      ctx,
    );
    expect(res.status).toBe(500);

    // Swap env → second fetch uses the real binding
    liveEnv = makeEnv().env;
    res = await handler.fetch(
      new Request("http://sam/api/capabilities"),
      initial,
      ctx,
    );
    const body = (await res.json()) as { intrinsics: string[] };
    expect(body.intrinsics).toContain("kv");
  });
});

describe("SamInstance default functions install", () => {
  it("mounts a default handler when the SAM has no functions.js", async () => {
    const { SamInstance } = await import("./instance.ts");
    const { loadEsmFromFileMap } = await import("./moduleLoader.ts");
    const inst = new SamInstance({
      id: "default-handler-test",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => makeEnv().env,
      files: {
        "index.html": "<head><title>t</title></head>",
      },
    });
    await inst.start();

    const res = await inst.functionsFetch(
      new Request("http://sam/api/capabilities"),
    );
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { intrinsics: string[] };
    expect(body.intrinsics.sort()).toEqual(["db", "kv", "vars"]);

    await inst.stop();
  });

  it("SAM-supplied functions.js still wins", async () => {
    const { SamInstance } = await import("./instance.ts");
    const { loadEsmFromFileMap } = await import("./moduleLoader.ts");
    const inst = new SamInstance({
      id: "user-supplied",
      loadEsm: loadEsmFromFileMap,
      createEnv: () => makeEnv().env,
      files: {
        "index.html": "<head><title>t</title></head>",
        "functions.js": `
          export default {
            async fetch(request) {
              return new Response(JSON.stringify({ user: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
              });
            }
          };
        `,
      },
    });
    await inst.start();

    const res = await inst.functionsFetch(
      new Request("http://sam/whatever"),
    );
    const body = (await res.json()) as { user: boolean };
    expect(body.user).toBe(true);

    await inst.stop();
  });
});