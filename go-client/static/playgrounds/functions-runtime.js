/*!
 * Playgrounds SAM-side `functions.js` helper — `intrinsicRoutes(env)` and
 * `compose([r1, r2, …])` (PG-UI-SDK-SPEC §4.1).
 *
 * Ships at `/playgrounds/functions-runtime.js`. A SAM's `functions.js` can
 * `import { intrinsicRoutes, compose } from "/playgrounds/functions-runtime.js"`
 * and compose the host-installed intrinsic routes with custom routes:
 *
 *   export default {
 *     fetch(request, env, ctx) {
 *       return intrinsicRoutes(env).handle(request).catch((e) => {
 *         if (e.code === "not_found") return myCustom(request, env, ctx);
 *         throw e;
 *       });
 *     },
 *   };
 *
 * The routing logic MUST stay wire-equivalent to `defaultFunctionsHandler.ts`
 * (the host-installed TS version). `tests/functionsRuntime.test.ts` enforces
 * parity on a standard request fixture.
 */
(function (root) {
  "use strict";

  var KEY_MAX_BYTES = 25 * 1024 * 1024;
  var KEY_RE = /^[A-Za-z0-9._\-~%:/+@]{1,512}$/u;
  var KV_PATH_RE = /^\/api\/kv\/([^/]+)$/u;
  var KV_LIST_PATH = "/api/kv/list";
  var DB_PREPARE_PATH = "/api/db/prepare";
  var DB_EXEC_PATH = "/api/db/exec";
  var DB_BATCH_PATH = "/api/db/batch";
  var VARS_ROOT_PATH = "/api/vars";
  var VARS_KEY_PATH_RE = /^\/api\/vars\/([^/]+)$/u;
  var SECRETS_PATH = "/api/secrets";
  var CAPABILITIES_PATH = "/api/capabilities";

  // ─── helpers ─────────────────────────────────────────────────────────────

  function decode(segment) {
    try {
      return decodeURIComponent(segment);
    } catch (_) {
      return segment;
    }
  }

  function jsonResponse(body, status) {
    if (typeof status !== "number") status = 200;
    return new Response(JSON.stringify(body), {
      status: status,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  function routingError(code, message) {
    var status;
    switch (code) {
      case "not_found":
        status = 404;
        break;
      case "kv_key_too_large":
        status = 413;
        break;
      case "db_sql_error":
        status = 400;
        break;
      case "secrets_locked":
        status = 423;
        break;
      case "internal_error":
      default:
        status = 500;
    }
    var err = new Error(message);
    err.code = code;
    err.status = status;
    return err;
  }

  function validateKey(key) {
    if (!key) throw routingError("not_found", "key required");
    if (!KEY_RE.test(key)) throw routingError("not_found", "invalid key");
    return key;
  }

  function requireKv(env) {
    var kv = env && env.KV;
    if (!kv || typeof kv.get !== "function") {
      throw routingError("internal_error", "env.KV unavailable");
    }
    return kv;
  }

  function requireDb(env) {
    var db = env && env.DB;
    if (!db || typeof db.prepare !== "function") {
      throw routingError("internal_error", "env.DB unavailable");
    }
    return db;
  }

  async function readJson(request) {
    var text = await request.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      throw routingError("not_found", "invalid JSON body");
    }
  }

  // ─── KV ──────────────────────────────────────────────────────────────────

  async function kvGet(env, rawKey) {
    var key = validateKey(rawKey);
    var kv = requireKv(env);
    var v = await kv.get(key);
    if (v == null) return new Response(null, { status: 404 });
    if (typeof v === "string") {
      return new Response(v, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(v, { status: 200 });
  }

  async function kvPut(env, rawKey, request, url) {
    var key = validateKey(rawKey);
    var kv = requireKv(env);
    var body = await request.arrayBuffer();
    if (body.byteLength > KEY_MAX_BYTES) {
      throw routingError("kv_key_too_large", "value exceeds 25 MiB");
    }
    var ttlRaw = url.searchParams.get("ttl");
    var ttl = ttlRaw ? Number(ttlRaw) : undefined;
    var opts = ttl && isFinite(ttl) ? { expirationTtl: ttl } : undefined;
    await kv.put(key, body, opts);
    return new Response(null, { status: 204 });
  }

  async function kvDelete(env, rawKey) {
    var key = validateKey(rawKey);
    var kv = requireKv(env);
    await kv.delete(key);
    return new Response(null, { status: 204 });
  }

  async function kvList(env, request) {
    var kv = requireKv(env);
    if (typeof kv.list !== "function") {
      throw routingError(
        "internal_error",
        "env.KV.list is not supported by this binding"
      );
    }
    var body = await readJson(request);
    body = body || {};
    var result = await kv.list({
      prefix: body.prefix,
      cursor: body.cursor,
      limit: body.limit,
    });
    return jsonResponse(result);
  }

  // ─── DB ─────────────────────────────────────────────────────────────────

  async function dbPrepare(env, request) {
    var db = requireDb(env);
    var body = (await readJson(request)) || {};
    var sql = typeof body.sql === "string" ? body.sql : null;
    if (!sql) throw routingError("db_sql_error", "sql required");
    var method = body.method || "all";
    if (method !== "all" && method !== "first" && method !== "run" && method !== "raw") {
      throw routingError("db_sql_error", "unsupported method " + String(method));
    }
    var bindArgs = Array.isArray(body.bind) ? body.bind : [];
    var stmt;
    try {
      stmt = db.prepare(sql).bind.apply(db.prepare(sql), bindArgs);
    } catch (e) {
      throw routingError(
        "db_sql_error",
        e instanceof Error ? e.message : "prepare failed"
      );
    }
    var result;
    try {
      if (method === "all") result = await stmt.all();
      else if (method === "first") result = await stmt.first();
      else if (method === "raw") result = await stmt.raw();
      else result = await stmt.run();
    } catch (e) {
      throw routingError(
        "db_sql_error",
        e instanceof Error ? e.message : "exec failed"
      );
    }
    return jsonResponse(result);
  }

  async function dbExec(env, request) {
    var db = requireDb(env);
    var body = (await readJson(request)) || {};
    var sql = typeof body.sql === "string" ? body.sql : null;
    if (!sql) throw routingError("db_sql_error", "sql required");
    var result;
    try {
      result = await db.exec(sql);
    } catch (e) {
      throw routingError(
        "db_sql_error",
        e instanceof Error ? e.message : "exec failed"
      );
    }
    return jsonResponse(result);
  }

  async function dbBatch(env, request) {
    var db = requireDb(env);
    if (typeof db.batch !== "function") {
      throw routingError(
        "internal_error",
        "env.DB.batch is not supported by this binding"
      );
    }
    var body = (await readJson(request)) || {};
    var stmts = Array.isArray(body.statements) ? body.statements : null;
    if (!stmts) throw routingError("db_sql_error", "statements required");
    var result = await db.batch(stmts);
    return jsonResponse(result);
  }

  // ─── vars ────────────────────────────────────────────────────────────────

  function varsAll(env) {
    var vars = env && env.vars;
    if (!vars || typeof vars !== "object") return jsonResponse({});
    var snap = {};
    for (var k in vars) {
      if (Object.prototype.hasOwnProperty.call(vars, k)) snap[k] = vars[k];
    }
    return jsonResponse(snap);
  }

  function varsGet(env, rawKey) {
    var key = validateKey(rawKey);
    var vars = env && env.vars;
    if (!vars || typeof vars !== "object") return new Response(null, { status: 404 });
    var v = vars[key];
    if (typeof v !== "string") return new Response(null, { status: 404 });
    return new Response(v, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // ─── secrets ─────────────────────────────────────────────────────────────

  function secretsList(env) {
    var sec = env && env.secrets;
    if (!sec || typeof sec !== "object") return jsonResponse({ names: [] });
    var names = [];
    for (var k in sec) {
      if (Object.prototype.hasOwnProperty.call(sec, k)) {
        var entry = sec[k];
        if (entry && typeof entry.get === "function") names.push(k);
      }
    }
    return jsonResponse({ names: names });
  }

  // ─── capabilities ───────────────────────────────────────────────────────

  function capabilities(env) {
    var intrinsics = [];
    if (env && env.KV) intrinsics.push("kv");
    if (env && env.DB) intrinsics.push("db");
    if (env && env.vars) intrinsics.push("vars");
    var bindings = [];
    if (env && env.HOST) bindings.push("host");
    if (env && env.SESSION) bindings.push("session");
    if (env && env.COMPUTE) bindings.push("compute");
    if (env && env.DELEGATE) bindings.push("delegate");
    return jsonResponse({ intrinsics: intrinsics, bindings: bindings });
  }

  // ─── router ──────────────────────────────────────────────────────────────

  async function route(request, env) {
    var url = new URL(request.url);
    var path = url.pathname;
    var method = request.method.toUpperCase();

    var kvMatch = path.match(KV_PATH_RE);
    if (kvMatch && method === "GET") return kvGet(env, decode(kvMatch[1]));
    if (kvMatch && method === "PUT") return kvPut(env, decode(kvMatch[1]), request, url);
    if (kvMatch && method === "DELETE") return kvDelete(env, decode(kvMatch[1]));

    if (path === KV_LIST_PATH && method === "POST") return kvList(env, request);
    if (path === DB_PREPARE_PATH && method === "POST") return dbPrepare(env, request);
    if (path === DB_EXEC_PATH && method === "POST") return dbExec(env, request);
    if (path === DB_BATCH_PATH && method === "POST") return dbBatch(env, request);

    if (path === VARS_ROOT_PATH && method === "GET") return varsAll(env);
    var varMatch = path.match(VARS_KEY_PATH_RE);
    if (varMatch && method === "GET") return varsGet(env, decode(varMatch[1]));

    if (path === SECRETS_PATH && method === "GET") return secretsList(env);
    if (path === CAPABILITIES_PATH && method === "GET") return capabilities(env);

    throw routingError("not_found", "unsupported route " + method + " " + path);
  }

  // ─── public surface ──────────────────────────────────────────────────────

  /**
   * Build a route object bound to a SAM-supplied `env`. Returns
   * `{ handle(request) }` that always resolves to a Response (matches the
   * host-installed TS handler). `not_found` responses carry
   * `{ code: "not_found" }` so `compose()` can chain them; internal errors
   * (db_sql_error, kv_key_too_large, …) become proper 4xx/5xx Responses.
   */
  function intrinsicRoutes(env) {
    return {
      handle: function (request) {
        try {
          return Promise.resolve(route(request, env)).then(undefined, function (e) {
            return errorResponseFor(e);
          });
        } catch (e) {
          return Promise.resolve(errorResponseFor(e));
        }
      },
    };
  }

  /**
   * Compose route objects left-to-right. The first non-`not_found` response
   * short-circuits the chain. If every route returns `not_found`, the final
   * 404 Response is returned (caller can replace it via a sentinel route).
   *
   * Each route must be `{ handle(request): Promise<Response> }`. SAM-side
   * routes can throw `routingError("not_found", ...)` to opt into fallthrough.
   */
  function compose(routes) {
    if (!Array.isArray(routes) || routes.length === 0) {
      return {
        handle: function () {
          return Promise.resolve(jsonResponse({ code: "not_found", message: "no routes" }, 404));
        },
      };
    }
    return {
      handle: function (request) {
        return runChain(routes, request, 0);
      },
    };
  }

  function runChain(routes, request, i) {
    if (i >= routes.length) {
      return Promise.resolve(
        jsonResponse({ code: "not_found", message: "no route matched" }, 404)
      );
    }
    var route = routes[i];
    return Promise.resolve(route.handle(request)).then(function (res) {
      if (
        res &&
        res.status === 404 &&
        // Peek the body to detect the not_found sentinel. We only fall through
        // when the body genuinely says so; otherwise a custom 404 short-circuits.
        typeof res.clone === "function"
      ) {
        return res
          .clone()
          .json()
          .then(function (j) {
            if (j && j.code === "not_found") return runChain(routes, request, i + 1);
            return res;
          }, function () {
            return res;
          });
      }
      return res;
    });
  }

  function errorResponseFor(e) {
    if (e && typeof e.code === "string" && typeof e.status === "number") {
      return jsonResponse({ code: e.code, message: e && e.message ? e.message : "" }, e.status);
    }
    return jsonResponse(
      {
        code: "internal_error",
        message: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }

  var surface = {
    intrinsicRoutes: intrinsicRoutes,
    compose: compose,
    routingError: routingError,
  };

  if (root && typeof root === "object") {
    root.PlaygroundsFunctionsRuntime = surface;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.PlaygroundsFunctionsRuntime === "undefined") {
    try {
      globalThis.PlaygroundsFunctionsRuntime = surface;
    } catch (_) { /* ignore — strict CSP without unsafe-eval */ }
  }
})(typeof window !== "undefined" ? window : null);
