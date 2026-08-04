/**
 * Minimal in-memory bindings for headless / tests (DEC-024).
 */

export interface MemoryKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function createMemoryKv(): MemoryKv {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

/** HOST stub: all methods reject with not_supported (Node headless MVP). */
export function createHostStub(
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const notSupported = async () => {
    const err = new Error("not_supported");
    (err as Error & { code: string }).code = "not_supported";
    throw err;
  };
  return new Proxy(
    { ...extra },
    {
      get(target, prop, receiver) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        if (typeof prop === "symbol") return undefined;
        return notSupported;
      },
    }
  );
}
