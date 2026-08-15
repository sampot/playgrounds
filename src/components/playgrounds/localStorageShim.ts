/**
 * localStorage → env.KV proxy shim (PG-LOCALSTORAGE-SHIM-SPEC §3).
 *
 * Compat layer so existing single-page apps (games) persist to SAM `env.KV`
 * via the standard synchronous `localStorage` API — no SAM-specific code.
 *
 * Synchronous reads/writes go to an in-memory cache (matching native
 * `Storage` sync semantics); writes are flushed in the background to the
 * host's existing `/api/kv/<key>` route (which is backed by `env.KV`).
 * Best-effort only — see AGENTS.md "Must not touch authoritative state".
 */

export type ShimFetch = (
  input: string | { url: string },
  init?: { method?: string; body?: string | null }
) => Promise<{ status: number; text(): Promise<string> }>;

export type ReadNative = (lsKey: string) => string | null;

export type WriteNative = (lsKey: string, value: string) => void;

export type DeleteNative = (lsKey: string) => void;

export type LocalStorageShimOptions = {
  /** fetch to the host /api/kv contract. Injected for testability. */
  fetch: ShimFetch;
  /** Deprecated compatibility inputs; writes are no longer debounced. */
  now?: () => number;
  flushMs?: number;
  /** Stable application scope used only for the native synchronous mirror. */
  mirrorScope?: string;
  /**
   * Read a pre-existing native localStorage value (e.g. go's legacy
   * Used as a fallback before hydration so synchronous startup reads work.
   */
  readNative?: ReadNative;
  /**
   * Write-through to native localStorage (synchronous mirror). Without it a
   * SAM's synchronous startup read (e.g. high score) returns null on the
   * first paint after refresh because the async KV hydrate has not landed
   * yet, making persisted values appear to reset to 0. The native mirror
   * survives refresh and is read by `getItem` until hydration completes.
   */
  writeNative?: WriteNative;
  /** Remove one value from the native synchronous mirror. */
  deleteNative?: DeleteNative;
  /** Remove all native mirror entries for this application scope. */
  clearNative?: (prefix: string) => void;
};

const KV_LIST_PATH = "/api/kv/list";

export interface LocalStorageShim {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
  /** Async cold-load: pull all application keys from /api/kv/list into cache. */
  hydrate(): Promise<void>;
  /** Wait for all KV mutations issued so far. */
  flush(): Promise<void>;
}

export const LOCALSTORAGE_MIRROR_ROOT = "__pg_kv_mirror__:";

export function localStorageMirrorPrefix(scope: string): string {
  return `${LOCALSTORAGE_MIRROR_ROOT}${encodeURIComponent(scope.trim() || "default")}:`;
}

export function createLocalStorageShim(
  opts: LocalStorageShimOptions
): LocalStorageShim {
  const readNative = opts.readNative;
  const writeNative = opts.writeNative;
  const deleteNative = opts.deleteNative;
  const clearNative = opts.clearNative;
  const mirrorPrefix = localStorageMirrorPrefix(opts.mirrorScope ?? "default");
  const cache = new Map<string, string>();
  const touched = new Set<string>();
  let currentWrite: Promise<void> | null = null;

  const nativeKey = (key: string) => `${mirrorPrefix}${key}`;
  const apiPath = (key: string) => `/api/kv/${encodeURIComponent(key)}`;

  function enqueueTask(task: () => Promise<void>): void {
    const previous = currentWrite;
    const operation = previous ? previous.then(task, task) : task();
    const tracked = operation.finally(() => {
      if (currentWrite === tracked) currentWrite = null;
    });
    currentWrite = tracked;
  }

  function enqueueWrite(key: string, value: string | null): void {
    enqueueTask(async () => {
      try {
        const response =
          value == null
            ? await opts.fetch(apiPath(key), { method: "DELETE" })
            : await opts.fetch(apiPath(key), { method: "PUT", body: value });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(`KV ${value == null ? "DELETE" : "PUT"} returned ${response.status}`);
        }
      } catch (e) {
        console.warn("[localStorage-shim] sync failed:", e);
      }
    });
  }

  function enqueueClear(): void {
    enqueueTask(async () => {
      try {
        const list = await opts.fetch(KV_LIST_PATH, {
          method: "POST",
          body: JSON.stringify({ prefix: "" }),
        });
        if (list.status !== 200) {
          throw new Error(`KV list returned ${list.status}`);
        }
        const body = JSON.parse(await list.text()) as {
          keys: { name: string }[];
        };
        for (const { name } of body.keys) {
          const response = await opts.fetch(
            `/api/kv/${encodeURIComponent(name)}`,
            { method: "DELETE" }
          );
          if (response.status < 200 || response.status >= 300) {
            throw new Error(`KV DELETE returned ${response.status}`);
          }
        }
      } catch (e) {
        console.warn("[localStorage-shim] clear failed:", e);
      }
    });
  }

  return {
    getItem(key) {
      if (cache.has(key)) return cache.get(key) as string;
      if (readNative) {
        const native = readNative(nativeKey(key));
        if (native != null) {
          cache.set(key, native);
          return native;
        }
      }
      return null;
    },
    setItem(key, value) {
      const v = String(value);
      cache.set(key, v);
      touched.add(key);
      if (writeNative) {
        try {
          writeNative(nativeKey(key), v);
        } catch {
          /* quota / private */
        }
      }
      enqueueWrite(key, v);
    },
    removeItem(key) {
      cache.delete(key);
      touched.add(key);
      if (deleteNative) {
        try {
          deleteNative(nativeKey(key));
        } catch {
          /* ignore */
        }
      }
      enqueueWrite(key, null);
    },
    clear() {
      for (const k of cache.keys()) {
        touched.add(k);
        if (deleteNative) {
          try {
            deleteNative(nativeKey(k));
          } catch {
            /* ignore */
          }
        }
      }
      cache.clear();
      if (clearNative) {
        try {
          clearNative(mirrorPrefix);
        } catch {
          /* ignore */
        }
      }
      enqueueClear();
    },
    key(index) {
      const keys = [...cache.keys()];
      return index >= 0 && index < keys.length ? keys[index] : null;
    },
    get length() {
      return cache.size;
    },
    async hydrate() {
      try {
        await (currentWrite ?? Promise.resolve());
        const res = await opts.fetch(KV_LIST_PATH, {
          method: "POST",
          body: JSON.stringify({ prefix: "" }),
        });
        if (res.status !== 200) return;
        const body = JSON.parse(await res.text()) as {
          keys: { name: string }[];
        };
        for (const { name } of body.keys) {
          const raw = await opts.fetch(
            `/api/kv/${encodeURIComponent(name)}`,
            { method: "GET" }
          );
          if (raw.status !== 200) continue;
          const value = await raw.text();
          // local write wins over hydrated value
          if (!touched.has(name) && !cache.has(name)) cache.set(name, value);
        }
      } catch (e) {
        console.warn("[localStorage-shim] hydrate failed:", e);
      }
    },
    flush() {
      return currentWrite ?? Promise.resolve();
    },
  };
}
