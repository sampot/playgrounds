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

export type ShimNow = () => number;

export type ReadNative = (lsKey: string) => string | null;

export type LocalStorageShimOptions = {
  /** fetch to the host /api/kv contract. Injected for testability. */
  fetch: ShimFetch;
  /** current time in ms (injected for testability / debounce). */
  now: ShimNow;
  /** background flush debounce window (ms). Default 250. */
  flushMs?: number;
  /** KV key prefix. Default "ls:" (localStorage). */
  prefix?: string;
  /**
   * Read a pre-existing native localStorage value (e.g. go's legacy
   * `pg-go-score:` shim). Used as a fallback before hydration, so a SAM
   * that already stored under `ls:<key>` is not blind on first paint.
   */
  readNative?: ReadNative;
};

const KV_LIST_PATH = "/api/kv/list";

export interface LocalStorageShim {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  readonly length: number;
  /** Async cold-load: pull `prefix:*` keys from /api/kv/list into cache. */
  hydrate(): Promise<void>;
  /** Force a background flush of pending writes (visibilitychange / pagehide). */
  flush(): void;
}

export function createLocalStorageShim(
  opts: LocalStorageShimOptions
): LocalStorageShim {
  const prefix = opts.prefix ?? "ls:";
  const flushMs = opts.flushMs ?? 250;
  const readNative = opts.readNative;
  const cache = new Map<string, string>();
  // pending writes: key (without prefix) → value; delete represented as null
  const pending = new Map<string, string | null>();
  let lastFlush = opts.now();
  let flushing = false;
  let currentFlush: Promise<void> | null = null;

  const kvKey = (key: string) => `${prefix}${key}`;
  const apiPath = (key: string) =>
    `/api/kv/${encodeURIComponent(kvKey(key))}`;

  function scheduleFlush() {
    const t = opts.now();
    if (t - lastFlush >= flushMs && !flushing) {
      void doFlush();
    }
  }

  function doFlush(): Promise<void> {
    if (flushing) return currentFlush ?? Promise.resolve();
    flushing = true;
    lastFlush = opts.now();
    currentFlush = (async () => {
      const batch = [...pending.entries()];
      pending.clear();
      for (const [key, value] of batch) {
        try {
          if (value == null) {
            await opts.fetch(apiPath(key), { method: "DELETE" });
          } else {
            await opts.fetch(apiPath(key), { method: "PUT", body: String(value) });
          }
        } catch (e) {
          console.warn("[localStorage-shim] flush failed:", e);
        }
      }
    })();
    currentFlush.finally(() => {
      flushing = false;
      currentFlush = null;
    });
    return currentFlush;
  }

  return {
    getItem(key) {
      if (cache.has(key)) return cache.get(key) as string;
      if (readNative) {
        const native = readNative(kvKey(key));
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
      pending.set(key, v);
      scheduleFlush();
    },
    removeItem(key) {
      cache.delete(key);
      pending.set(key, null);
      scheduleFlush();
    },
    clear() {
      for (const k of cache.keys()) pending.set(k, null);
      cache.clear();
      // explicit clear intent: flush deletes immediately, not debounced
      void doFlush();
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
        const res = await opts.fetch(KV_LIST_PATH, {
          method: "POST",
          body: JSON.stringify({ prefix }),
        });
        if (res.status !== 200) return;
        const body = JSON.parse(await res.text()) as {
          keys: { name: string }[];
        };
        for (const { name } of body.keys) {
          if (!name.startsWith(prefix)) continue;
          const raw = await opts.fetch(
            `/api/kv/${encodeURIComponent(name)}`,
            { method: "GET" }
          );
          if (raw.status !== 200) continue;
          const value = await raw.text();
          const plain = name.slice(prefix.length);
          // local write wins over hydrated value
          if (!cache.has(plain)) cache.set(plain, value);
        }
      } catch (e) {
        console.warn("[localStorage-shim] hydrate failed:", e);
      }
    },
    flush() {
      void doFlush();
    },
  };
}
