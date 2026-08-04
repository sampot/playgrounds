/**
 * OPFS project access for Python／JS REPL workers (DEC-039 follow-on).
 * Reads／writes sandbox files in the Worker without mirroring the whole
 * work-project FileMap through the shell heap.
 */

import { basename, normalizeProjectPath, parentDir } from "./pathUtils";
import { isMetaFilename } from "./projectTypes";
import { resolvePlaygroundsProjectDir } from "./wasiOpfsFs";

export type ReplProjectFileEntry = {
  path: string;
  bytes: Uint8Array;
};

async function resolveDir(
  root: FileSystemDirectoryHandle,
  relDir: string
): Promise<FileSystemDirectoryHandle> {
  if (!relDir) return root;
  let cur = root;
  for (const part of relDir.split("/").filter(Boolean)) {
    cur = await cur.getDirectoryHandle(part, { create: false });
  }
  return cur;
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: ReplProjectFileEntry[]
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (isMetaFilename(name)) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      await walkDir(handle as FileSystemDirectoryHandle, rel, out);
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    const buf = new Uint8Array(await file.arrayBuffer());
    out.push({ path: rel, bytes: buf });
  }
}

/** All project-relative files under OPFS (excluding meta). */
export async function listReplProjectFiles(
  projectId: string
): Promise<ReplProjectFileEntry[]> {
  const root = await resolvePlaygroundsProjectDir(projectId);
  const out: ReplProjectFileEntry[] = [];
  await walkDir(root, "", out);
  return out;
}

export async function readReplProjectBytes(
  projectId: string,
  path: string
): Promise<Uint8Array | undefined> {
  const norm = normalizeProjectPath(path);
  if (!norm) return undefined;
  try {
    const root = await resolvePlaygroundsProjectDir(projectId);
    const dirPath = parentDir(norm);
    const name = basename(norm);
    const dir = await resolveDir(root, dirPath);
    const handle = await dir.getFileHandle(name, { create: false });
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function writeReplProjectBytes(
  projectId: string,
  path: string,
  bytes: Uint8Array
): Promise<void> {
  const norm = normalizeProjectPath(path);
  if (!norm) throw new Error("路徑無效");
  const root = await resolvePlaygroundsProjectDir(projectId);
  const dirPath = parentDir(norm);
  const name = basename(norm);
  let cur = root;
  if (dirPath) {
    for (const part of dirPath.split("/").filter(Boolean)) {
      cur = await cur.getDirectoryHandle(part, { create: true });
    }
  }
  const fh = await cur.getFileHandle(name, { create: true });
  const createSync = (
    fh as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<{
        truncate(n: number): void;
        write(b: ArrayBuffer | ArrayBufferView, o?: { at: number }): number;
        flush(): void;
        close(): void;
      }>;
    }
  ).createSyncAccessHandle;
  if (typeof createSync === "function") {
    const h = await createSync.call(fh);
    try {
      h.truncate(0);
      if (bytes.byteLength) h.write(bytes, { at: 0 });
      h.flush();
    } finally {
      h.close();
    }
    return;
  }
  const w = await fh.createWritable();
  try {
    await w.write(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer
    );
  } finally {
    await w.close();
  }
}

export function replProjectBytesToText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function replProjectTextToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
