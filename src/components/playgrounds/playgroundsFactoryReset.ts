/**
 * Factory-reset Playgrounds to first-visit empty state (DEC-040).
 * Human UI only — not exposed on env.HOST.
 */

import { resetAgentRuntimeHub } from "./agentRuntimeHub";
import { stopBackendRuntime } from "./backendHost";
import { disposeHostJsRunner } from "./hostJs";
import { disposeHostPythonRunner } from "./hostPython";
import { disposeHostWasiRunner } from "./hostWasi";
import { resetMockDbMemoryForTests } from "./mockDb";
import { resetMockKvMemoryForTests } from "./mockKv";
import { destroySecretStore } from "./secretStore";

/** OPFS directory names under origin storage root (current + known legacy). */
export const PLAYGROUNDS_OPFS_ROOTS = [
  "playgrounds-projects",
  "web-ide-projects",
  "playgrounds-kv",
  "playgrounds-db",
  "playgrounds-d1",
  "playgrounds-secret-store",
  "playgrounds-secrets",
  "playgrounds-checkpoints",
  "playgrounds-agent-runtime",
] as const;

/** localStorage keys owned by Playgrounds (current + known legacy). */
export const PLAYGROUNDS_LOCAL_STORAGE_KEYS = [
  "playgrounds-prefs-v1",
  "playgrounds-layout",
  "ide-layout",
  "playgrounds-files-sidebar",
  "ide-files-sidebar",
  "playgrounds-play-welcome-v2",
  "playgrounds-active-project",
  "playgrounds-active-agent",
  "playgrounds-tool-prefs-v1",
  "playgrounds-coding-worker-byok",
] as const;

/** sessionStorage keys owned by Playgrounds. */
export const PLAYGROUNDS_SESSION_STORAGE_KEYS = [
  "playgrounds-agent-runtime-peer",
] as const;

export type FactoryResetResult = {
  removedOpfsRoots: string[];
  missingOpfsRoots: string[];
  clearedLocalStorageKeys: string[];
  clearedSessionStorageKeys: string[];
};

export type FactoryResetOptions = {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  localStorage?: Pick<Storage, "removeItem" | "getItem">;
  sessionStorage?: Pick<Storage, "removeItem" | "getItem">;
  /** When false, skip SecretStore／in-memory KV／DB clears (unit tests of list wipe). Default true. */
  clearRuntimeMemory?: boolean;
  /**
   * When false, skip stopping Backend Runtime／WASI／Py／JS workers before OPFS wipe.
   * Default true — open SyncAccessHandle／workers can make removeEntry hang or fail.
   */
  releaseRuntimes?: boolean;
};

/** Release workers / handles that may pin OPFS roots. */
export async function releasePlaygroundsRuntimes(): Promise<void> {
  try {
    await stopBackendRuntime();
  } catch {
    /* ignore */
  }
  try {
    await resetAgentRuntimeHub();
  } catch {
    /* ignore */
  }
  try {
    disposeHostWasiRunner();
  } catch {
    /* ignore */
  }
  try {
    disposeHostPythonRunner();
  } catch {
    /* ignore */
  }
  try {
    disposeHostJsRunner();
  } catch {
    /* ignore */
  }
}

function isNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "NotFoundError" || name === "NotFoundErrorDOMException";
}

async function removeOpfsRoot(
  storageRoot: FileSystemDirectoryHandle,
  name: string
): Promise<"removed" | "missing"> {
  try {
    await storageRoot.removeEntry(name, { recursive: true });
    return "removed";
  } catch (err) {
    if (isNotFoundError(err)) return "missing";
    throw err;
  }
}

function clearStorageKeys(
  storage: Pick<Storage, "removeItem" | "getItem"> | undefined,
  keys: readonly string[]
): string[] {
  if (!storage) return [];
  const cleared: string[] = [];
  for (const key of keys) {
    try {
      if (storage.getItem(key) != null) {
        storage.removeItem(key);
        cleared.push(key);
      } else {
        storage.removeItem(key);
      }
    } catch {
      /* private mode / unavailable */
    }
  }
  return cleared;
}

/**
 * Wipe Playgrounds OPFS roots and browser Storage keys.
 * Does not navigate; caller should `location.assign(playgroundsHomePath())`.
 * Aborts on non-missing OPFS remove errors (partial wipe reported via throw).
 */
export async function resetPlaygroundsToFirstVisit(
  options?: FactoryResetOptions
): Promise<FactoryResetResult> {
  const clearRuntimeMemory = options?.clearRuntimeMemory !== false;
  const releaseRuntimes = options?.releaseRuntimes !== false;
  const removedOpfsRoots: string[] = [];
  const missingOpfsRoots: string[] = [];

  if (releaseRuntimes) {
    await releasePlaygroundsRuntimes();
  }

  const getDirectory =
    options?.getDirectory ??
    (typeof navigator !== "undefined" && navigator.storage?.getDirectory
      ? () => navigator.storage.getDirectory()
      : null);

  // OPFS first — abort on non-missing errors before wiping prefs／memory.
  if (getDirectory) {
    const storageRoot = await getDirectory();
    for (const name of PLAYGROUNDS_OPFS_ROOTS) {
      const outcome = await removeOpfsRoot(storageRoot, name);
      if (outcome === "removed") removedOpfsRoots.push(name);
      else missingOpfsRoots.push(name);
    }
  }

  if (clearRuntimeMemory) {
    await destroySecretStore();
    resetMockKvMemoryForTests();
    resetMockDbMemoryForTests();
  }

  const local =
    options?.localStorage ??
    (typeof localStorage !== "undefined" ? localStorage : undefined);
  const session =
    options?.sessionStorage ??
    (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);

  const clearedLocalStorageKeys = clearStorageKeys(
    local,
    PLAYGROUNDS_LOCAL_STORAGE_KEYS
  );
  const clearedSessionStorageKeys = clearStorageKeys(
    session,
    PLAYGROUNDS_SESSION_STORAGE_KEYS
  );

  return {
    removedOpfsRoots,
    missingOpfsRoots,
    clearedLocalStorageKeys,
    clearedSessionStorageKeys,
  };
}
