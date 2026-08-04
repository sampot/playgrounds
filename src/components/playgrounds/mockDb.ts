/**
 * SQLite binding for Playgrounds functions (env.DB; DEC-020).
 * Uses sql.js; API shaped like Cloudflare D1 subset (仿 D1), not full parity.
 * Persists DB bytes to OPFS when available.
 */

import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

export interface DbResult<T = Record<string, unknown>> {
  success: boolean;
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
    rows_read?: number;
    rows_written?: number;
  };
  results: T[];
}

export interface DbPreparedStatement {
  bind(...values: unknown[]): DbPreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface DbDatabase {
  prepare(query: string): DbPreparedStatement;
  batch<T = Record<string, unknown>>(
    statements: DbPreparedStatement[]
  ): Promise<DbResult<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

const DB_ROOT = "playgrounds-db";
/** Legacy OPFS root (pre-rename from D1). */
const LEGACY_DB_ROOT = "playgrounds-d1";
const DB_FILE = "db.sqlite";

const memoryDbBytes = new Map<string, Uint8Array>();
const liveDbs = new Map<string, Database>();
let sqlPromise: Promise<SqlJsStatic> | null = null;

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const isNode =
      typeof process !== "undefined" && Boolean(process.versions?.node);
    sqlPromise = initSqlJs(
      isNode
        ? undefined
        : {
            locateFile: file =>
              `https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/${file}`,
          }
    );
  }
  return sqlPromise;
}

async function projectDbDir(
  sandboxId: string,
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsAvailable()) return null;
  const root = await navigator.storage.getDirectory();
  try {
    const dbRoot = await root.getDirectoryHandle(DB_ROOT, { create });
    return dbRoot.getDirectoryHandle(sandboxId, { create });
  } catch {
    return null;
  }
}

async function legacyDbDir(
  sandboxId: string
): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const legacyRoot = await root.getDirectoryHandle(LEGACY_DB_ROOT);
    return legacyRoot.getDirectoryHandle(sandboxId);
  } catch {
    return null;
  }
}

async function readSqliteFromDir(
  dir: FileSystemDirectoryHandle
): Promise<Uint8Array | null> {
  try {
    const handle = await dir.getFileHandle(DB_FILE);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeSqliteToDir(
  dir: FileSystemDirectoryHandle,
  bytes: Uint8Array
): Promise<void> {
  const handle = await dir.getFileHandle(DB_FILE, { create: true });
  const writable = await handle.createWritable();
  const chunk = new Uint8Array(bytes.byteLength);
  chunk.set(bytes);
  await writable.write(chunk);
  await writable.close();
}

async function loadBytes(sandboxId: string): Promise<Uint8Array | null> {
  const cached = memoryDbBytes.get(sandboxId);
  if (cached) return cached;

  const dir = await projectDbDir(sandboxId, false);
  if (dir) {
    const buf = await readSqliteFromDir(dir);
    if (buf) {
      memoryDbBytes.set(sandboxId, buf);
      return buf;
    }
  }

  const legacy = await legacyDbDir(sandboxId);
  if (legacy) {
    const buf = await readSqliteFromDir(legacy);
    if (buf) {
      memoryDbBytes.set(sandboxId, buf);
      // Migrate into the new OPFS root when possible.
      const dest = await projectDbDir(sandboxId, true);
      if (dest) {
        try {
          await writeSqliteToDir(dest, buf);
        } catch {
          /* keep memory cache */
        }
      }
      return buf;
    }
  }

  return null;
}

async function persist(sandboxId: string, db: Database): Promise<void> {
  const exported = db.export();
  const bytes = new Uint8Array(exported);
  memoryDbBytes.set(sandboxId, bytes);
  const dir = await projectDbDir(sandboxId, true);
  if (!dir) return;
  await writeSqliteToDir(dir, bytes);
}

async function getDb(sandboxId: string): Promise<Database> {
  const existing = liveDbs.get(sandboxId);
  if (existing) return existing;
  const SQL = await getSql();
  const bytes = await loadBytes(sandboxId);
  const db = bytes?.byteLength ? new SQL.Database(bytes) : new SQL.Database();
  liveDbs.set(sandboxId, db);
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
    private readonly sandboxId: string,
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
    const db = await getDb(this.sandboxId);
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
        await persist(this.sandboxId, db);
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
    const db = await getDb(this.sandboxId);
    const stmt = db.prepare(this.query);
    try {
      if (this.params.length) stmt.bind(this.params as never[]);
      const rows: unknown[][] = [];
      while (stmt.step()) {
        rows.push(stmt.get() as unknown[]);
      }
      await persist(this.sandboxId, db);
      return rows as T[];
    } finally {
      stmt.free();
    }
  }
}

export function createMockDb(sandboxId: string): DbDatabase {
  return {
    prepare(query: string) {
      return new PreparedStatement(sandboxId, query);
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
      const db = await getDb(sandboxId);
      db.run(query);
      await persist(sandboxId, db);
      return {
        count: db.getRowsModified(),
        duration: performance.now() - started,
      };
    },
  };
}

/** Export current sqlite bytes (null if empty / missing). */
export async function exportMockDbBytes(
  sandboxId: string
): Promise<Uint8Array | null> {
  const live = liveDbs.get(sandboxId);
  if (live) {
    const exported = live.export();
    return new Uint8Array(exported);
  }
  const bytes = await loadBytes(sandboxId);
  if (!bytes?.byteLength) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

/** Replace project DB with sqlite bytes (clears live handle first). */
export async function importMockDbBytes(
  sandboxId: string,
  bytes: Uint8Array
): Promise<void> {
  await clearMockDbStore(sandboxId);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  memoryDbBytes.set(sandboxId, copy);
  const dir = await projectDbDir(sandboxId, true);
  if (!dir) return;
  await writeSqliteToDir(dir, copy);
}

/** Drop in-memory + OPFS DB for a project (including legacy root). */
export async function clearMockDbStore(sandboxId: string): Promise<void> {
  const db = liveDbs.get(sandboxId);
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    liveDbs.delete(sandboxId);
  }
  memoryDbBytes.delete(sandboxId);
  if (!isOpfsAvailable()) return;
  try {
    const root = await navigator.storage.getDirectory();
    try {
      const dbRoot = await root.getDirectoryHandle(DB_ROOT);
      await dbRoot.removeEntry(sandboxId, { recursive: true });
    } catch {
      /* missing */
    }
    try {
      const legacyRoot = await root.getDirectoryHandle(LEGACY_DB_ROOT);
      await legacyRoot.removeEntry(sandboxId, { recursive: true });
    } catch {
      /* missing */
    }
  } catch {
    /* missing */
  }
}

/** Test helper: reset live DBs / memory without OPFS. */
export function resetMockDbMemoryForTests(): void {
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
