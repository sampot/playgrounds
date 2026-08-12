/**
 * Pure routing functions for the host-installed default `functions.js`
 * (PG-UI-SDK-SPEC §4).
 *
 * Both `defaultFunctionsHandler.ts` (the host-installed runtime) and
 * `public/playgrounds/functions-runtime.js` (the SAM-side helper) MUST route
 * the same paths to the same handlers. The TS implementation here is the
 * reference; the JS port in `public/playgrounds/functions-runtime.js` is
 * verified equivalent by `tests/functionsRuntime.test.ts` (parity fixture
 * over the standard request shapes).
 *
 * The module is intentionally side-effect free — no I/O, no fetch, no
 * bindings beyond what the caller passes via `env`. It returns either a
 * `Response` or throws an `HandlerError`. Higher layers translate errors
 * into wire-shaped `PgError` JSON.
 */

import type { SamEnv } from "./types.ts";

/** Same structural shapes as `defaultFunctionsHandler.ts`. Re-exported
 * (rather than imported) so the JS port can mirror them byte-for-byte. */
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

export type VarsBinding = Readonly<Record<string, string>>;

export interface SecretBindingEntry {
  get(): Promise<string>;
}

export interface SecretsNamespace {
  readonly [name: string]: SecretBindingEntry | undefined;
}

export type RoutingErrorCode =
  | "not_found"
  | "kv_key_too_large"
  | "db_sql_error"
  | "secrets_locked"
  | "internal_error";

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  constructor(code: RoutingErrorCode, message: string) {
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

export const KEY_MAX_BYTES = 25 * 1024 * 1024;
const KEY_RE = /^[A-Za-z0-9._\-~%:/+@]{1,512}$/u;

export const KV_PATH_RE = /^\/api\/kv\/([^/]+)$/u;
export const KV_LIST_PATH = "/api/kv/list";
export const DB_PREPARE_PATH = "/api/db/prepare";
export const DB_EXEC_PATH = "/api/db/exec";
export const DB_BATCH_PATH = "/api/db/batch";
export const VARS_ROOT_PATH = "/api/vars";
export const VARS_KEY_PATH_RE = /^\/api\/vars\/([^/]+)$/u;
export const SECRETS_PATH = "/api/secrets";
export const CAPABILITIES_PATH = "/api/capabilities";

/** Top-level dispatcher. Mirrors SPEC §4.2. Throws `RoutingError` on miss. */
export async function route(request: Request, env: SamEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const kvMatch = path.match(KV_PATH_RE);
  if (kvMatch && method === "GET") return kvGet(env, decode(kvMatch[1]!));
  if (kvMatch && method === "PUT") return kvPut(env, decode(kvMatch[1]!), request, url);
  if (kvMatch && method === "DELETE") return kvDelete(env, decode(kvMatch[1]!));

  if (path === KV_LIST_PATH && method === "POST") return kvList(env, request);
  if (path === DB_PREPARE_PATH && method === "POST") return dbPrepare(env, request);
  if (path === DB_EXEC_PATH && method === "POST") return dbExec(env, request);
  if (path === DB_BATCH_PATH && method === "POST") return dbBatch(env, request);

  if (path === VARS_ROOT_PATH && method === "GET") return varsAll(env);
  const varMatch = path.match(VARS_KEY_PATH_RE);
  if (varMatch && method === "GET") return varsGet(env, decode(varMatch[1]!));

  if (path === SECRETS_PATH && method === "GET") return secretsList(env);
  if (path === CAPABILITIES_PATH && method === "GET") return capabilities(env);

  throw new RoutingError("not_found", `unsupported route ${method} ${path}`);
}

// ─── KV ─────────────────────────────────────────────────────────────────────

export function requireKv(env: SamEnv): KvBinding {
  const kv = env["KV"];
  if (!kv || typeof (kv as KvBinding).get !== "function") {
    throw new RoutingError("internal_error", "env.KV unavailable");
  }
  return kv as KvBinding;
}

export function validateKey(key: string): string {
  if (!key) throw new RoutingError("not_found", "key required");
  if (!KEY_RE.test(key)) {
    throw new RoutingError("not_found", "invalid key");
  }
  return key;
}

export async function kvGet(env: SamEnv, rawKey: string): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  const v = await kv.get(key);
  if (v == null) return new Response(null, { status: 404 });
  if (typeof v === "string") {
    return new Response(v, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(v as ArrayBuffer, { status: 200 });
}

export async function kvPut(
  env: SamEnv,
  rawKey: string,
  request: Request,
  url: URL,
): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  const body = await request.arrayBuffer();
  if (body.byteLength > KEY_MAX_BYTES) {
    throw new RoutingError("kv_key_too_large", "value exceeds 25 MiB");
  }
  const ttlRaw = url.searchParams.get("ttl");
  const ttl = ttlRaw ? Number(ttlRaw) : undefined;
  const opts = ttl && Number.isFinite(ttl) ? { expirationTtl: ttl } : undefined;
  await kv.put(key, body, opts);
  return new Response(null, { status: 204 });
}

export async function kvDelete(env: SamEnv, rawKey: string): Promise<Response> {
  const key = validateKey(rawKey);
  const kv = requireKv(env);
  await kv.delete(key);
  return new Response(null, { status: 204 });
}

export async function kvList(env: SamEnv, request: Request): Promise<Response> {
  const kv = requireKv(env);
  if (typeof kv.list !== "function") {
    throw new RoutingError(
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

export function requireDb(env: SamEnv): DbBinding {
  const db = env["DB"];
  if (!db || typeof (db as DbBinding).prepare !== "function") {
    throw new RoutingError("internal_error", "env.DB unavailable");
  }
  return db as DbBinding;
}

export async function dbPrepare(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  const body = (await readJson(request)) as {
    sql?: unknown;
    bind?: unknown[];
    method?: unknown;
  } | null;
  const sql = typeof body?.sql === "string" ? body.sql : null;
  if (!sql) throw new RoutingError("db_sql_error", "sql required");
  const method = (body?.method ?? "all") as "all" | "first" | "run" | "raw";
  if (!["all", "first", "run", "raw"].includes(method)) {
    throw new RoutingError("db_sql_error", `unsupported method ${String(method)}`);
  }
  const bindArgs = Array.isArray(body?.bind) ? body!.bind! : [];
  let stmt;
  try {
    stmt = db.prepare(sql).bind(...bindArgs);
  } catch (e) {
    throw new RoutingError(
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
    throw new RoutingError(
      "db_sql_error",
      e instanceof Error ? e.message : "exec failed",
    );
  }
  return jsonResponse(result);
}

export async function dbExec(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  const body = (await readJson(request)) as { sql?: unknown } | null;
  const sql = typeof body?.sql === "string" ? body.sql : null;
  if (!sql) throw new RoutingError("db_sql_error", "sql required");
  let result;
  try {
    result = await db.exec(sql);
  } catch (e) {
    throw new RoutingError(
      "db_sql_error",
      e instanceof Error ? e.message : "exec failed",
    );
  }
  return jsonResponse(result);
}

export async function dbBatch(env: SamEnv, request: Request): Promise<Response> {
  const db = requireDb(env);
  if (typeof db.batch !== "function") {
    throw new RoutingError(
      "internal_error",
      "env.DB.batch is not supported by this binding",
    );
  }
  const body = (await readJson(request)) as { statements?: unknown } | null;
  const stmts = Array.isArray(body?.statements) ? body!.statements! : null;
  if (!stmts) throw new RoutingError("db_sql_error", "statements required");
  const result = await db.batch(stmts);
  return jsonResponse(result);
}

// ─── vars ────────────────────────────────────────────────────────────────────

export function varsAll(env: SamEnv): Response {
  const vars = env["vars"];
  if (!vars || typeof vars !== "object") return jsonResponse({});
  return jsonResponse({ ...(vars as VarsBinding) });
}

export function varsGet(env: SamEnv, rawKey: string): Response {
  const key = validateKey(rawKey);
  const vars = env["vars"];
  if (!vars || typeof vars !== "object") return new Response(null, { status: 404 });
  const v = (vars as VarsBinding)[key];
  if (typeof v !== "string") return new Response(null, { status: 404 });
  return new Response(v, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// ─── secrets ────────────────────────────────────────────────────────────────

export function secretsList(env: SamEnv): Response {
  const sec = env["secrets"];
  if (!sec || typeof sec !== "object") return jsonResponse({ names: [] });
  const names = Object.keys(sec as SecretsNamespace).filter(
    (k) => typeof (sec as SecretsNamespace)[k]?.get === "function",
  );
  return jsonResponse({ names });
}

// ─── capabilities ──────────────────────────────────────────────────────────

export function capabilities(env: SamEnv): Response {
  const intrinsics: string[] = [];
  if (env["KV"]) intrinsics.push("kv");
  if (env["DB"]) intrinsics.push("db");
  if (env["vars"]) intrinsics.push("vars");

  const bindings: string[] = [];
  for (const key of ["HOST", "SESSION", "COMPUTE", "DELEGATE"] as const) {
    if (env[key]) bindings.push(key.toLowerCase());
  }

  return jsonResponse({ intrinsics, bindings });
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new RoutingError("not_found", "invalid JSON body");
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
