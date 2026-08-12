/**
 * Host-installed default `functions.js` handler (PG-UI-SDK-SPEC §4).
 *
 * When a SAM provides no `functions.js`, the Backend Runtime mounts this handler
 * so the canvas `/api/...` surface can speak to the sandbox's intrinsic
 * bindings (`env.KV` / `env.DB` / `env.vars` / `env.secrets.*`) without the SAM
 * author writing CRUD plumbing.
 *
 * Routes (see PG-UI-SDK-SPEC.md §4.2):
 *
 *   GET    /api/kv/{key}              → env.KV.get(key)
 *   PUT    /api/kv/{key}              → env.KV.put(key, body, { expirationTtl })
 *   DELETE /api/kv/{key}              → env.KV.delete(key)
 *   POST   /api/kv/list               → env.KV.list({ prefix, cursor, limit })
 *   POST   /api/db/prepare            → env.DB.prepare(sql).bind(...).<method>()
 *   POST   /api/db/exec              → env.DB.exec(sql)
 *   POST   /api/db/batch             → env.DB.batch(statements)
 *   GET    /api/vars[/key]           → env.vars
 *   GET    /api/secrets              → env.secrets.* names only (DEC-029/035)
 *   GET    /api/capabilities         → SDK uses to decide attribute visibility
 *
 * The handler is purely structural: it accepts any binding whose shape matches
 * `KvBinding` / `DbBinding` / `VarsBinding` / `SecretsNamespace`. The browser
 * shell injects `createMockKvNamespace(...)` and `createMockDb(...)`; the Node
 * headless host injects `createMemoryKv()` and skips DB. See sam-host/node/host.ts
 * for the latter.
 *
 * SECRETS: per DEC-029/035, the default handler NEVER returns secret values —
 * only the names listed on `env.secrets.*`. Values must be read inside a SAM's
 * own `functions.js` via `env.secrets.<NAME>.get()` (the binding lives behind
 * a master key only the backend can hold).
 */

import type {
  FunctionsHandler,
  SamEnv,
  SamExecutionContext,
} from "./types.ts";

/** Structural shape the default handler needs from `env.KV`. */
export interface KvBinding {
  get(key: string): Promise<string | ArrayBuffer | unknown | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    opts?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list?(opts?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    cursor?: string;
    list_complete: boolean;
  }>;
}

/** Structural shape the default handler needs from `env.DB`. */
export interface DbBinding {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ rows: T[]; meta?: unknown }>;
      first<T = unknown>(): Promise<{ row: T | null; meta?: unknown }>;
      run(): Promise<{ changes: number; last_row_id?: number }>;
      raw<T = unknown>(): Promise<{ rows: T[]; meta?: unknown }>;
    };
  };
  exec(sql: string): Promise<{ count: number; duration: number }>;
  batch?(statements: unknown[]): Promise<unknown>;
}

/** Structural shape the default handler needs from `env.vars`. */
export type VarsBinding = Readonly<Record<string, string>>;

/** A single secret binding (DEC-029). The handler NEVER calls `.get()`. */
export interface SecretBindingEntry {
  get(): Promise<string>;
}

/** Structural shape the default handler needs from `env.secrets`. */
export interface SecretsNamespace {
  readonly [name: string]: SecretBindingEntry | undefined;
}

/** Machine-readable error codes — see PG-UI-SDK-SPEC.md §3.4. */
export type DefaultHandlerErrorCode =
  | "not_found"
  | "kv_key_too_large"
  | "db_sql_error"
  | "secrets_locked"
  | "internal_error";

const KEY_MAX_BYTES = 25 * 1024 * 1024;
// URL-decoded key charset. Allow alphanumerics + the typical "namespace separator"
// characters that real Cloudflare KV accepts. Disallow whitespace, quotes, and
// other characters that would break URL routing or shell interpolation.
const KEY_RE = /^[A-Za-z0-9._\-~%:/+@]{1,512}$/u;
const KV_PATH_RE = /^\/api\/kv\/([^/]+)$/u;
const KV_LIST_PATH = "/api/kv/list";
const DB_PREPARE_PATH = "/api/db/prepare";
const DB_EXEC_PATH = "/api/db/exec";
const DB_BATCH_PATH = "/api/db/batch";
const VARS_ROOT_PATH = "/api/vars";
const VARS_KEY_PATH_RE = /^\/api\/vars\/([^/]+)$/u;
const SECRETS_PATH = "/api/secrets";
const CAPABILITIES_PATH = "/api/capabilities";

/** Build a default functions.js-style `fetch` handler bound to the given env. */
export function createDefaultFunctionsHandler(
  envOrGetter: SamEnv | (() => SamEnv),
): FunctionsHandler {
  const getEnv = typeof envOrGetter === "function" ? envOrGetter : () => envOrGetter;
  return {
    async fetch(
      request: Request,
      _e: SamEnv,
      _ctx: SamExecutionContext,
    ): Promise<Response> {
      try {
        return await route(request, getEnv());
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}

async function route(request: Request, env: SamEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // KV by-key
  const kvMatch = path.match(KV_PATH_RE);
  if (kvMatch && method === "GET") return kvGet(env, decode(kvMatch[1]!));
  if (kvMatch && method === "PUT") return kvPut(env, decode(kvMatch[1]!), request, url);
  if (kvMatch && method === "DELETE") return kvDelete(env, decode(kvMatch[1]!));

  // KV list
  if (path === KV_LIST_PATH && method === "POST") {
    return kvList(env, request);
  }

  // DB prepare
  if (path === DB_PREPARE_PATH && method === "POST") {
    return dbPrepare(env, request);
  }
  if (path === DB_EXEC_PATH && method === "POST") {
    return dbExec(env, request);
  }
  if (path === DB_BATCH_PATH && method === "POST") {
    return dbBatch(env, request);
  }

  // vars
  if (path === VARS_ROOT_PATH && method === "GET") {
    return varsAll(env);
  }
  const varMatch = path.match(VARS_KEY_PATH_RE);
  if (varMatch && method === "GET") {
    return varsGet(env, decode(varMatch[1]!));
  }

  // secrets
  if (path === SECRETS_PATH && method === "GET") {
    return secretsList(env);
  }

  // capabilities
  if (path === CAPABILITIES_PATH && method === "GET") {
    return capabilities(env);
  }

  return notFound(`unsupported route ${method} ${path}`);
}

// ─── KV ────────────────────────────────────────────────────────────────────

function requireKv(env: SamEnv): KvBinding {
  const kv = env["KV"];
  if (!kv || typeof (kv as KvBinding).get !== "function") {
    throw new HandlerError("internal_error", "env.KV unavailable");
  }
  return kv as KvBinding;
}

function validateKey(key: string): string {
  if (!key) throw new HandlerError("not_found", "key required");
  if (!KEY_RE.test(key)) {
    throw new HandlerError("not_found", "invalid key");
  }
  return key;
}

async function kvGet(env: SamEnv, rawKey: string): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  const v = await kv.get(key);
  if (v == null) {
    return new Response(null, { status: 404 });
  }
  // KV strings round-trip as text/plain; JSON / binary pass through.
  if (typeof v === "string") {
    return new Response(v, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(v as ArrayBuffer, { status: 200 });
}

async function kvPut(
  env: SamEnv,
  rawKey: string,
  request: Request,
  url: URL,
): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  const body = await request.arrayBuffer();
  if (body.byteLength > KEY_MAX_BYTES) {
    throw new HandlerError("kv_key_too_large", "value exceeds 25 MiB");
  }
  const ttlRaw = url.searchParams.get("ttl");
  const ttl = ttlRaw ? Number(ttlRaw) : undefined;
  const opts = ttl && Number.isFinite(ttl) ? { expirationTtl: ttl } : undefined;
  // Cloudflare KV-shaped put: string → string, ArrayBuffer → bytes. We pass the
  // body through as ArrayBuffer so the binding decides encoding.
  await kv.put(key, body, opts);
  return new Response(null, { status: 204 });
}

async function kvDelete(env: SamEnv, rawKey: string): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  await kv.delete(key);
  return new Response(null, { status: 204 });
}

async function kvList(env: SamEnv, request: Request): Promise<Response> {
  const kv = requireKv(env);
  if (typeof kv.list !== "function") {
    throw new HandlerError(
      "internal_error",
      "env.KV.list is not supported by this binding",
    );
  }
  const body = (await readJson(request)) as {
    prefix?: string;
    cursor?: string;
    limit?: number;
  } | null;
  const result = await kv.list({
    prefix: body?.prefix,
    cursor: body?.cursor,
    limit: body?.limit,
  });
  return jsonResponse(result);
}

// ─── DB ─────────────────────────────────────────────────────────────────────

function requireDb(env: SamEnv): DbBinding {
  const db = env["DB"];
  if (!db || typeof (db as DbBinding).prepare !== "function") {
    throw new HandlerError("internal_error", "env.DB unavailable");
  }
  return db as DbBinding;
}

async function dbPrepare(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  const body = (await readJson(request)) as {
    sql?: unknown;
    bind?: unknown[];
    method?: unknown;
  } | null;
  const sql = typeof body?.sql === "string" ? body.sql : null;
  if (!sql) throw new HandlerError("db_sql_error", "sql required");
  const method = (body?.method ?? "all") as "all" | "first" | "run" | "raw";
  if (!["all", "first", "run", "raw"].includes(method)) {
    throw new HandlerError("db_sql_error", `unsupported method ${String(method)}`);
  }
  const bindArgs = Array.isArray(body?.bind) ? body!.bind! : [];
  let stmt;
  try {
    stmt = db.prepare(sql).bind(...bindArgs);
  } catch (e) {
    throw new HandlerError(
      "db_sql_error",
      e instanceof Error ? e.message : "prepare failed",
    );
  }
  let result;
  try {
    if (method === "all") result = await stmt.all();
    else if (method === "first") result = await stmt.first();
    else if (method === "raw") result = await stmt.raw();
    else result = await stmt.run();
  } catch (e) {
    throw new HandlerError(
      "db_sql_error",
      e instanceof Error ? e.message : "exec failed",
    );
  }
  return jsonResponse(result);
}

async function dbExec(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  const body = (await readJson(request)) as { sql?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql : null;
  if (!sql) throw new HandlerError("db_sql_error", "sql required");
  let result;
  try {
    result = await db.exec(sql);
  } catch (e) {
    throw new HandlerError(
      "db_sql_error",
      e instanceof Error ? e.message : "exec failed",
    );
  }
  return jsonResponse(result);
}

async function dbBatch(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  if (typeof db.batch !== "function") {
    throw new HandlerError(
      "internal_error",
      "env.DB.batch is not supported by this binding",
    );
  }
  const body = (await readJson(request)) as { statements?: unknown } | null;
  const stmts = Array.isArray(body?.statements) ? body!.statements! : null;
  if (!stmts) throw new HandlerError("db_sql_error", "statements required");
  const result = await db.batch(stmts);
  return jsonResponse(result);
}

// ─── vars ───────────────────────────────────────────────────────────────────

function varsAll(env: SamEnv): Response {
  const vars = env["vars"];
  if (!vars || typeof vars !== "object") {
    return jsonResponse({});
  }
  // Snapshot to avoid leaking frozen internal structure.
  return jsonResponse({ ...(vars as VarsBinding) });
}

function varsGet(env: SamEnv, rawKey: string): Response {
  const key = validateKey(rawKey);
  const vars = env["vars"];
  if (!vars || typeof vars !== "object") {
    return new Response(null, { status: 404 });
  }
  const v = (vars as VarsBinding)[key];
  if (typeof v !== "string") {
    return new Response(null, { status: 404 });
  }
  return new Response(v, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// ─── secrets ────────────────────────────────────────────────────────────────

function secretsList(env: SamEnv): Response {
  const sec = env["secrets"];
  if (!sec || typeof sec !== "object") {
    return jsonResponse({ names: [] });
  }
  // We deliberately DO NOT touch `binding.get()` here. The handler reports only
  // the names visible on `env.secrets`. Secret values must be obtained inside
  // the SAM's own functions.js, never over the wire.
  const names = Object.keys(sec as SecretsNamespace).filter(
    (k) => typeof (sec as SecretsNamespace)[k]?.get === "function",
  );
  return jsonResponse({ names });
}

// ─── capabilities ──────────────────────────────────────────────────────────

function capabilities(env: SamEnv): Response {
  const intrinsics: string[] = [];
  if (env["KV"]) intrinsics.push("kv");
  if (env["DB"]) intrinsics.push("db");
  if (env["vars"]) intrinsics.push("vars");

  const bindings: string[] = [];
  for (const key of [
    "HOST",
    "SESSION",
    "COMPUTE",
    "DELEGATE",
  ] as const) {
    if (env[key]) bindings.push(key.toLowerCase());
  }

  return jsonResponse({ intrinsics, bindings });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new HandlerError("not_found", "invalid JSON body");
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function notFound(message: string): Response {
  return jsonResponse({ code: "not_found", message }, 404);
}

function errorResponse(e: unknown): Response {
  if (e instanceof HandlerError) {
    return jsonResponse({ code: e.code, message: e.message }, e.status());
  }
  return jsonResponse(
    {
      code: "internal_error",
      message: e instanceof Error ? e.message : String(e),
    },
    500,
  );
}

class HandlerError extends Error {
  readonly code: DefaultHandlerErrorCode;
  constructor(code: DefaultHandlerErrorCode, message: string) {
    super(message);
    this.code = code;
  }
  status(): number {
    switch (this.code) {
      case "not_found":
        return 404;
      case "kv_key_too_large":
        return 413;
      case "db_sql_error":
        return 400;
      case "secrets_locked":
        return 423;
      case "internal_error":
      default:
        return 500;
    }
  }
}