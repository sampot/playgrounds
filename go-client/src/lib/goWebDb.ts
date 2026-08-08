/**
 * go env.DB — sql.js 仿 D1 subset; persist sqlite bytes via IndexedDB
 * (localStorage fallback for small DBs). Never OPFS.
 *
 * sql.js is **dynamic-imported** (not on the KV-only game path). WASM is
 * same-origin `/vendor/sql.js/*` so the go SW can network-first offline-cache it.
 */

import type { Database, SqlJsStatic } from "sql.js";
import type {
  DbDatabase,
  DbPreparedStatement,
  DbResult,
} from "@pg/mockDb";
import { goStorageKeyForCatalog } from "./goWebKv";

/** Same-origin vendor dir (see scripts/vendor-sqljs.mjs → static/vendor/sql.js). */
export const GO_SQLJS_VENDOR_BASE = "/vendor/sql.js";

const IDB_NAME = "go-sam-db-v1";
const IDB_STORE = "sqlite";
const LS_PREFIX = "pg-go-db:";
/** localStorage fallback cap (~1.5MB binary → base64). */
const LS_MAX_BYTES = 1_200_000;

export type GoWebDbOptions = {
  durable?: boolean;
};

const memoryDbBytes = new Map<string, Uint8Array>();
const liveDbs = new Map<string, Database>();
let sqlPromise: Promise<SqlJsStatic> | null = null;

function isNodeRuntime(): boolean {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function locateSqlJsFile(file: string): string {
  const base = file.split("/").pop() || file;
  return `${GO_SQLJS_VENDOR_BASE}/${base}`;
}

async function loadInitSqlJs(): Promise<
  (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>
> {
  const mod = await import("sql.js");
  return mod.default;
}

/** Lazy: first env.DB use only — keeps go shell／KV games free of sql.js／wasm. */
function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = await loadInitSqlJs();
      if (isNodeRuntime()) {
        return initSqlJs();
      }
      return initSqlJs({ locateFile: locateSqlJsFile });
    })();
  }
  return sqlPromise;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbLoad(ns: string): Promise<Uint8Array | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(ns);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const v = req.result;
      if (v instanceof Uint8Array) resolve(v);
      else if (v instanceof ArrayBuffer) resolve(new Uint8Array(v));
      else resolve(null);
    };
  });
}

async function idbSave(ns: string, bytes: Uint8Array): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    tx.objectStore(IDB_STORE).put(copy, ns);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(ns: string): Promise<boolean> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(ns);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function lsLoad(ns: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + encodeURIComponent(ns));
    if (raw == null) return null;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function lsSave(ns: string, bytes: Uint8Array): void {
  if (bytes.byteLength > LS_MAX_BYTES) return;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  localStorage.setItem(LS_PREFIX + encodeURIComponent(ns), btoa(s));
}

function lsClear(ns: string): boolean {
  const k = LS_PREFIX + encodeURIComponent(ns);
  try {
    if (localStorage.getItem(k) == null) return false;
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

async function loadBytes(ns: string, durable: boolean): Promise<Uint8Array | null> {
  const cached = memoryDbBytes.get(ns);
  if (cached) return cached;
  if (!durable) return null;
  try {
    const fromIdb = await idbLoad(ns);
    if (fromIdb) {
      memoryDbBytes.set(ns, fromIdb);
      return fromIdb;
    }
  } catch {
    /* try ls */
  }
  const fromLs = lsLoad(ns);
  if (fromLs) memoryDbBytes.set(ns, fromLs);
  return fromLs;
}

async function persist(ns: string, db: Database, durable: boolean): Promise<void> {
  const exported = db.export();
  const bytes = new Uint8Array(exported);
  memoryDbBytes.set(ns, bytes);
  if (!durable) return;
  try {
    await idbSave(ns, bytes);
    return;
  } catch {
    /* fall through */
  }
  try {
    lsSave(ns, bytes);
  } catch {
    /* private */
  }
}

async function getDb(ns: string, durable: boolean): Promise<Database> {
  const existing = liveDbs.get(ns);
  if (existing) return existing;
  const SQL = await getSql();
  const bytes = await loadBytes(ns, durable);
  const db = bytes?.byteLength ? new SQL.Database(bytes) : new SQL.Database();
  liveDbs.set(ns, db);
  return db;
}

function rowObjects(
  columns: string[],
  values: unknown[][]
): Record<string, unknown>[] {
  return values.map(row => {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]!] = row[i];
    }
    return obj;
  });
}

class PreparedStatement implements DbPreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly ns: string,
    private readonly durable: boolean,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): DbPreparedStatement {
    this.params = values;
    return this;
  }

  async first<T = Record<string, unknown>>(
    colName?: string
  ): Promise<T | null> {
    const all = await this.all<T>();
    const row = all.results[0];
    if (!row) return null;
    if (colName) {
      return ((row as Record<string, unknown>)[colName] as T) ?? null;
    }
    return row;
  }

  async run<T = Record<string, unknown>>(): Promise<DbResult<T>> {
    return this.all<T>();
  }

  async all<T = Record<string, unknown>>(): Promise<DbResult<T>> {
    const started = performance.now();
    const db = await getDb(this.ns, this.durable);
    try {
      const stmt = db.prepare(this.query);
      try {
        if (this.params.length) stmt.bind(this.params as never[]);
        const columns = stmt.getColumnNames();
        const values: unknown[][] = [];
        while (stmt.step()) {
          values.push(stmt.get() as unknown[]);
        }
        const changes = db.getRowsModified();
        const lastIdStmt = db.exec("SELECT last_insert_rowid() AS id");
        const last_row_id = Number(lastIdStmt[0]?.values[0]?.[0] ?? 0);
        await persist(this.ns, db, this.durable);
        return {
          success: true,
          meta: {
            duration: performance.now() - started,
            changes,
            last_row_id,
            rows_read: values.length,
            rows_written: changes,
          },
          results: rowObjects(columns, values) as T[],
        };
      } finally {
        stmt.free();
      }
    } catch (e) {
      throw new Error(
        e instanceof Error ? e.message : `DB prepare failed: ${String(e)}`
      );
    }
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const db = await getDb(this.ns, this.durable);
    const stmt = db.prepare(this.query);
    try {
      if (this.params.length) stmt.bind(this.params as never[]);
      const rows: unknown[][] = [];
      while (stmt.step()) {
        rows.push(stmt.get() as unknown[]);
      }
      await persist(this.ns, db, this.durable);
      return rows as T[];
    } finally {
      stmt.free();
    }
  }
}

export function createGoWebDb(
  namespace: string,
  options: GoWebDbOptions = {}
): DbDatabase {
  const ns = namespace.trim();
  if (!ns) throw new Error("go DB namespace must be non-empty");
  const durable = options.durable !== false;

  return {
    prepare(query: string) {
      return new PreparedStatement(ns, durable, query);
    },
    async batch<T = Record<string, unknown>>(
      statements: DbPreparedStatement[]
    ) {
      const out: DbResult<T>[] = [];
      for (const s of statements) {
        out.push(await s.all<T>());
      }
      return out;
    },
    async exec(query: string) {
      const started = performance.now();
      const db = await getDb(ns, durable);
      db.run(query);
      await persist(ns, db, durable);
      return { count: 0, duration: performance.now() - started };
    },
  };
}

export async function clearGoWebDb(namespace: string): Promise<number> {
  const ns = namespace.trim();
  if (!ns) return 0;
  const live = liveDbs.get(ns);
  if (live) {
    try {
      live.close();
    } catch {
      /* ignore */
    }
    liveDbs.delete(ns);
  }
  memoryDbBytes.delete(ns);
  let n = 0;
  try {
    if (await idbClear(ns)) n += 1;
  } catch {
    /* no idb */
  }
  if (lsClear(ns)) n += 1;
  return n;
}

export async function clearGoWebDbForCatalog(catalogId: string): Promise<number> {
  return clearGoWebDb(goStorageKeyForCatalog(catalogId));
}

export function resetGoWebDbMemoryForTests(): void {
  for (const db of liveDbs.values()) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  liveDbs.clear();
  memoryDbBytes.clear();
  sqlPromise = null;
}
