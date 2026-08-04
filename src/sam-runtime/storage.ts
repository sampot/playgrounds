/**
 * Durable key/value storage for agent runtime (mailbox / alarms / registry).
 * Browser: OPFS adapter (later). Tests / Node: memory.
 */

export interface RuntimeStorage {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export function createMemoryStorage(
  seed?: Record<string, string>
): RuntimeStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    async get(key) {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async list(prefix = "") {
      return [...map.keys()].filter(k => k.startsWith(prefix)).sort();
    },
  };
}

export async function readJson<T>(
  storage: RuntimeStorage,
  key: string,
  fallback: T
): Promise<T> {
  const raw = await storage.get(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(
  storage: RuntimeStorage,
  key: string,
  value: unknown
): Promise<void> {
  await storage.put(key, JSON.stringify(value));
}
