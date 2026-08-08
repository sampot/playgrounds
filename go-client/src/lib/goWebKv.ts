/**
 * go env.KV — Cloudflare-shaped, durable via IndexedDB with localStorage fallback.
 * Never uses OPFS (DEC-050; field shell keeps OPFS in mockKv).
 */

import type {
  MockKvGetType,
  MockKvListOptions,
  MockKvListResult,
  MockKvNamespace,
} from "@pg/mockKv";

const IDB_NAME = "go-sam-kv-v1";
const IDB_STORE = "entries";
const LS_PREFIX = "pg-go-kv:";

export type GoWebKvOptions = {
  /** false = memory only (Invite／ephemeral). Default true for `/s/<catalog_id>`. */
  durable?: boolean;
};

type Backend = "idb" | "localStorage" | "memory";

const memoryStores = new Map<string, Map<string, Uint8Array>>();

function storeFor(ns: string): Map<string, Uint8Array> {
  let s = memoryStores.get(ns);
  if (!s) {
    s = new Map();
    memoryStores.set(ns, s);
  }
  return s;
}

function toBytes(value: string | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

function idbCompoundKey(ns: string, key: string): string {
  return `${ns}\0${key}`;
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

async function idbGet(ns: string, key: string): Promise<Uint8Array | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(idbCompoundKey(ns, key));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const v = req.result;
      if (v == null) {
        resolve(null);
        return;
      }
      if (v instanceof Uint8Array) {
        resolve(v);
        return;
      }
      if (v instanceof ArrayBuffer) {
        resolve(new Uint8Array(v));
        return;
      }
      resolve(null);
    };
  });
}

async function idbPut(ns: string, key: string, bytes: Uint8Array): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const req = tx.objectStore(IDB_STORE).put(copy, idbCompoundKey(ns, key));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(ns: string, key: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).delete(idbCompoundKey(ns, key));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbListKeys(ns: string): Promise<string[]> {
  const db = await openIdb();
  const prefix = `${ns}\0`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAllKeys();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const keys = (req.result as IDBValidKey[])
        .map(k => String(k))
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length));
      resolve(keys);
    };
  });
}

async function idbClearNamespace(ns: string): Promise<number> {
  const keys = await idbListKeys(ns);
  if (!keys.length) return 0;
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    for (const key of keys) {
      store.delete(idbCompoundKey(ns, key));
    }
    tx.oncomplete = () => resolve(keys.length);
    tx.onerror = () => reject(tx.error);
  });
}

function lsKey(ns: string, key: string): string {
  return `${LS_PREFIX}${encodeURIComponent(ns)}:${encodeURIComponent(key)}`;
}

function lsNsPrefix(ns: string): string {
  return `${LS_PREFIX}${encodeURIComponent(ns)}:`;
}

function lsGet(ns: string, key: string): Uint8Array | null {
  try {
    const raw = localStorage.getItem(lsKey(ns, key));
    if (raw == null) return null;
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function lsPut(ns: string, key: string, bytes: Uint8Array): void {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  localStorage.setItem(lsKey(ns, key), btoa(s));
}

function lsDelete(ns: string, key: string): void {
  localStorage.removeItem(lsKey(ns, key));
}

function lsListKeys(ns: string): string[] {
  const prefix = lsNsPrefix(ns);
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      keys.push(decodeURIComponent(k.slice(prefix.length)));
    }
  } catch {
    /* private */
  }
  return keys;
}

function lsClearNamespace(ns: string): number {
  const prefix = lsNsPrefix(ns);
  const toRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    /* private */
  }
  return toRemove.length;
}

async function pickBackend(durable: boolean): Promise<Backend> {
  if (!durable) return "memory";
  try {
    await openIdb();
    return "idb";
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== "undefined") {
      const probe = `${LS_PREFIX}__probe__`;
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return "localStorage";
    }
  } catch {
    /* private */
  }
  return "memory";
}

const backendCache = new Map<string, Promise<Backend>>();

function backendFor(ns: string, durable: boolean): Promise<Backend> {
  const cacheKey = `${durable ? "d" : "m"}:${ns}`;
  let p = backendCache.get(cacheKey);
  if (!p) {
    p = pickBackend(durable);
    backendCache.set(cacheKey, p);
  }
  return p;
}

async function readBytes(
  ns: string,
  key: string,
  durable: boolean
): Promise<Uint8Array | null> {
  const mem = storeFor(ns);
  if (mem.has(key)) return mem.get(key) ?? null;
  const backend = await backendFor(ns, durable);
  if (backend === "memory") return null;
  if (backend === "idb") {
    const bytes = await idbGet(ns, key);
    if (bytes) mem.set(key, bytes);
    return bytes;
  }
  const bytes = lsGet(ns, key);
  if (bytes) mem.set(key, bytes);
  return bytes;
}

async function writeBytes(
  ns: string,
  key: string,
  bytes: Uint8Array,
  durable: boolean
): Promise<void> {
  storeFor(ns).set(key, bytes);
  const backend = await backendFor(ns, durable);
  if (backend === "idb") await idbPut(ns, key, bytes);
  else if (backend === "localStorage") lsPut(ns, key, bytes);
}

async function removeBytes(
  ns: string,
  key: string,
  durable: boolean
): Promise<void> {
  storeFor(ns).delete(key);
  const backend = await backendFor(ns, durable);
  if (backend === "idb") await idbDelete(ns, key);
  else if (backend === "localStorage") lsDelete(ns, key);
}

async function allKeys(ns: string, durable: boolean): Promise<string[]> {
  const mem = storeFor(ns);
  const backend = await backendFor(ns, durable);
  if (backend === "memory") return [...mem.keys()];
  if (backend === "idb") {
    const keys = await idbListKeys(ns);
    for (const k of mem.keys()) {
      if (!keys.includes(k)) keys.push(k);
    }
    return keys;
  }
  const keys = lsListKeys(ns);
  for (const k of mem.keys()) {
    if (!keys.includes(k)) keys.push(k);
  }
  return keys;
}

/** Stable namespace for solo `/s/<catalog_id>` KV／DB. */
export function goStorageKeyForCatalog(catalogId: string): string {
  return `catalog:${catalogId.trim()}`;
}

/** Non-durable namespace (Invite canvas／anonymous). */
export function goStorageKeyEphemeral(sandboxId: string): string {
  return `ephemeral:${sandboxId.trim()}`;
}

export function createGoWebKv(
  namespace: string,
  options: GoWebKvOptions = {}
): MockKvNamespace {
  const ns = namespace.trim();
  if (!ns) throw new Error("go KV namespace must be non-empty");
  const durable = options.durable !== false;

  return {
    async get(
      key: string,
      type: MockKvGetType = "text"
    ): Promise<string | ArrayBuffer | unknown | null> {
      const bytes = await readBytes(ns, key, durable);
      if (!bytes) return null;
      if (type === "arrayBuffer") {
        return bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        );
      }
      const text = new TextDecoder().decode(bytes);
      if (type === "json") {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new Error(`KV get(${key}): invalid JSON`);
        }
      }
      return text;
    },

    async put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView
    ): Promise<void> {
      if (!key) throw new Error("KV put: key must be non-empty");
      await writeBytes(ns, key, toBytes(value), durable);
    },

    async delete(key: string): Promise<void> {
      await removeBytes(ns, key, durable);
    },

    async list(options: MockKvListOptions = {}): Promise<MockKvListResult> {
      const prefix = options.prefix ?? "";
      const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
      const startAfter = options.cursor ?? "";
      const names = (await allKeys(ns, durable))
        .filter(name => name.startsWith(prefix))
        .sort((a, b) => a.localeCompare(b, "en"));
      const startIdx = startAfter ? names.findIndex(n => n > startAfter) : 0;
      const from = startIdx < 0 ? names.length : startIdx;
      const slice = names.slice(from, from + limit);
      const list_complete = from + slice.length >= names.length;
      return {
        keys: slice.map(name => ({ name })),
        list_complete,
        cursor: list_complete ? undefined : slice[slice.length - 1],
      };
    },
  };
}

/** Clear durable＋memory KV for a namespace (§6.6 layer 1). */
export async function clearGoWebKv(namespace: string): Promise<number> {
  const ns = namespace.trim();
  if (!ns) return 0;
  memoryStores.delete(ns);
  backendCache.delete(`d:${ns}`);
  backendCache.delete(`m:${ns}`);
  let n = 0;
  try {
    n += await idbClearNamespace(ns);
  } catch {
    /* no idb */
  }
  n += lsClearNamespace(ns);
  return n;
}

export async function clearGoWebKvForCatalog(catalogId: string): Promise<number> {
  return clearGoWebKv(goStorageKeyForCatalog(catalogId));
}

/** Test helper. */
export function resetGoWebKvMemoryForTests(): void {
  memoryStores.clear();
  backendCache.clear();
}
