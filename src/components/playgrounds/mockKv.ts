/**
 * Cloudflare KV-shaped binding for Playgrounds functions (DEC-016 / Phase 3).
 * Persists to OPFS when available; otherwise in-memory (tests / unsupported browsers).
 * Clone project does not copy KV (PG-AGENT-PLAN).
 */

export interface MockKvListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

export interface MockKvListResult {
  keys: { name: string }[];
  list_complete: boolean;
  cursor?: string;
}

export type MockKvGetType = "text" | "json" | "arrayBuffer";

export interface MockKvNamespace {
  /** `text` → string；`json` → parsed value；`arrayBuffer` → ArrayBuffer；缺 key → null */
  get(
    key: string,
    type?: MockKvGetType
  ): Promise<string | ArrayBuffer | unknown | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: MockKvListOptions): Promise<MockKvListResult>;
}

/** OPFS root dir name is historical; keys under it are sandboxId. */
const KV_ROOT = "playgrounds-kv";

const memoryStores = new Map<string, Map<string, Uint8Array>>();
/** sandboxId → loaded flag for OPFS hydration */
const opfsLoaded = new Set<string>();

function encodeKey(key: string): string {
  return encodeURIComponent(key);
}

function decodeKey(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

function storeFor(sandboxId: string): Map<string, Uint8Array> {
  let store = memoryStores.get(sandboxId);
  if (!store) {
    store = new Map();
    memoryStores.set(sandboxId, store);
  }
  return store;
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

async function projectKvDir(
  sandboxId: string
): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsAvailable()) return null;
  const root = await navigator.storage.getDirectory();
  const kvRoot = await root.getDirectoryHandle(KV_ROOT, { create: true });
  return kvRoot.getDirectoryHandle(sandboxId, { create: true });
}

async function ensureLoaded(
  sandboxId: string
): Promise<Map<string, Uint8Array>> {
  const store = storeFor(sandboxId);
  if (opfsLoaded.has(sandboxId) || !isOpfsAvailable()) return store;
  try {
    const dir = await projectKvDir(sandboxId);
    if (!dir) {
      opfsLoaded.add(sandboxId);
      return store;
    }
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind !== "file") continue;
      const file = await (handle as FileSystemFileHandle).getFile();
      store.set(decodeKey(name), new Uint8Array(await file.arrayBuffer()));
    }
  } catch {
    /* leave memory store as-is */
  }
  opfsLoaded.add(sandboxId);
  return store;
}

async function persistKey(
  sandboxId: string,
  key: string,
  bytes: Uint8Array
): Promise<void> {
  const dir = await projectKvDir(sandboxId);
  if (!dir) return;
  const handle = await dir.getFileHandle(encodeKey(key), { create: true });
  const writable = await handle.createWritable();
  const chunk = new Uint8Array(bytes.byteLength);
  chunk.set(bytes);
  await writable.write(chunk);
  await writable.close();
}

async function removePersistedKey(
  sandboxId: string,
  key: string
): Promise<void> {
  const dir = await projectKvDir(sandboxId);
  if (!dir) return;
  try {
    await dir.removeEntry(encodeKey(key));
  } catch {
    /* missing */
  }
}

export function createMockKvNamespace(sandboxId: string): MockKvNamespace {
  return {
    async get(
      key: string,
      type: MockKvGetType = "text"
    ): Promise<string | ArrayBuffer | unknown | null> {
      const store = await ensureLoaded(sandboxId);
      const bytes = store.get(key);
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
      const store = await ensureLoaded(sandboxId);
      const bytes = toBytes(value);
      store.set(key, bytes);
      await persistKey(sandboxId, key, bytes);
    },

    async delete(key: string): Promise<void> {
      const store = await ensureLoaded(sandboxId);
      store.delete(key);
      await removePersistedKey(sandboxId, key);
    },

    async list(options: MockKvListOptions = {}): Promise<MockKvListResult> {
      const store = await ensureLoaded(sandboxId);
      const prefix = options.prefix ?? "";
      const limit = Math.min(Math.max(options.limit ?? 1000, 1), 1000);
      const startAfter = options.cursor ?? "";
      const names = [...store.keys()]
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

/** Snapshot all KV entries for export / clone (after OPFS hydrate). */
export async function exportMockKvEntries(
  sandboxId: string
): Promise<Map<string, Uint8Array>> {
  const store = await ensureLoaded(sandboxId);
  const out = new Map<string, Uint8Array>();
  for (const [key, bytes] of store) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    out.set(key, copy);
  }
  return out;
}

/** Replace project KV with the given entries (clears previous keys). */
export async function importMockKvEntries(
  sandboxId: string,
  entries: Map<string, Uint8Array>
): Promise<void> {
  await clearMockKvStore(sandboxId);
  const store = storeFor(sandboxId);
  for (const [key, bytes] of entries) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    store.set(key, copy);
    await persistKey(sandboxId, key, copy);
  }
  opfsLoaded.add(sandboxId);
}

/** Drop in-memory + OPFS KV for a project (e.g. after delete). */
export async function clearMockKvStore(sandboxId: string): Promise<void> {
  memoryStores.delete(sandboxId);
  opfsLoaded.delete(sandboxId);
  if (!isOpfsAvailable()) return;
  try {
    const root = await navigator.storage.getDirectory();
    const kvRoot = await root.getDirectoryHandle(KV_ROOT);
    await kvRoot.removeEntry(sandboxId, { recursive: true });
  } catch {
    /* missing */
  }
}

/** Test helper: peek raw store size (memory cache; call after get/put). */
export function mockKvStoreSize(sandboxId: string): number {
  return memoryStores.get(sandboxId)?.size ?? 0;
}

/** Test helper: reset memory caches without touching OPFS. */
export function resetMockKvMemoryForTests(): void {
  memoryStores.clear();
  opfsLoaded.clear();
}
