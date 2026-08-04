/**
 * OPFS-backed RuntimeStorage for Agent Model durable state (DEC-031).
 * Root: playgrounds-agent-runtime/ (mailbox, alarms, registry, leader.json).
 */

import type { RuntimeStorage } from "../../sam-runtime/index.ts";
import { isOpfsSupported } from "./opfsStore";

const ROOT = "playgrounds-agent-runtime";

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  const storageRoot = await navigator.storage.getDirectory();
  return storageRoot.getDirectoryHandle(ROOT, { create: true });
}

/** Resolve nested path `a/b/c.json` → directory handle for `a/b` + file name. */
async function resolvePath(
  root: FileSystemDirectoryHandle,
  key: string,
  create: boolean
): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
  const parts = key.split("/").filter(Boolean);
  if (parts.length === 0) throw new Error("empty storage key");
  const name = parts[parts.length - 1]!;
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i]!, { create });
  }
  return { dir, name };
}

/**
 * Create OPFS RuntimeStorage. Throws if OPFS unavailable.
 * Flat in-memory fallback: use sam-runtime `createMemoryStorage` in tests.
 */
export async function createOpfsRuntimeStorage(): Promise<RuntimeStorage> {
  if (!isOpfsSupported()) {
    throw new Error("opfs_unavailable");
  }
  const root = await getRoot();

  return {
    async get(key) {
      try {
        const { dir, name } = await resolvePath(root, key, false);
        const fh = await dir.getFileHandle(name);
        const file = await fh.getFile();
        return await file.text();
      } catch {
        return null;
      }
    },
    async put(key, value) {
      const { dir, name } = await resolvePath(root, key, true);
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(value);
      await w.close();
    },
    async delete(key) {
      try {
        const { dir, name } = await resolvePath(root, key, false);
        await dir.removeEntry(name);
      } catch {
        /* missing ok */
      }
    },
    async list(prefix = "") {
      const out: string[] = [];
      async function walk(
        dir: FileSystemDirectoryHandle,
        base: string
      ): Promise<void> {
        for await (const [name, handle] of dir.entries()) {
          const path = base ? `${base}/${name}` : name;
          if (handle.kind === "directory") {
            await walk(handle as FileSystemDirectoryHandle, path);
          } else if (!prefix || path.startsWith(prefix)) {
            out.push(path);
          }
        }
      }
      await walk(root, "");
      return out.sort();
    },
  };
}
