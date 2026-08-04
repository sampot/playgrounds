import { describe, expect, it, beforeEach } from "vitest";
import {
  ACTIVE_WORK_PROJECT_STORAGE_KEY,
  readActiveWorkSandboxId,
  writeActiveWorkSandboxId,
} from "./activeWorkProject";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memory = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memory,
  });
  return store;
}

describe("activeWorkProject", () => {
  beforeEach(() => {
    installMemoryLocalStorage().clear();
  });

  it("round-trips id", () => {
    expect(readActiveWorkSandboxId()).toBeNull();
    writeActiveWorkSandboxId("proj-1");
    expect(readActiveWorkSandboxId()).toBe("proj-1");
    expect(localStorage.getItem(ACTIVE_WORK_PROJECT_STORAGE_KEY)).toBe(
      "proj-1"
    );
    writeActiveWorkSandboxId(null);
    expect(readActiveWorkSandboxId()).toBeNull();
  });
});
