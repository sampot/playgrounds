/**
 * OPFS snapshots for HOST.checkpoint / restore (PG-AGENT-PLAN Phase 4).
 */

import { omitGitFromDirList, omitGitFromFileMap } from "./gitPathUtils";
import {
  createDir,
  loadProjectFiles,
  listProjectDirs,
  saveFile,
  deleteFile,
  deleteDir,
  isOpfsSupported,
} from "./sandboxAuthority";
import type { FileMap } from "./projectTypes";
import { sortProjectPaths } from "./pathUtils";

const CHECKPOINT_ROOT = "playgrounds-checkpoints";

export interface CheckpointMeta {
  id: string;
  sandboxId: string;
  label: string;
  createdAt: string;
}

async function checkpointsRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error("此瀏覽器不支援 OPFS");
  }
  const storageRoot = await navigator.storage.getDirectory();
  return storageRoot.getDirectoryHandle(CHECKPOINT_ROOT, { create: true });
}

async function projectCheckpointDir(
  sandboxId: string
): Promise<FileSystemDirectoryHandle> {
  const root = await checkpointsRoot();
  return root.getDirectoryHandle(sandboxId, { create: true });
}

async function writeJson(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: unknown
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(data));
  await writable.close();
}

async function readJson<T>(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<T> {
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  return JSON.parse(await file.text()) as T;
}

async function writeBinaryFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  const chunk = new Uint8Array(bytes.byteLength);
  chunk.set(bytes);
  await writable.write(chunk);
  await writable.close();
}

async function writeFileAtPath(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string | Uint8Array
): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop();
  if (!fileName) throw new Error("invalid path");
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  if (typeof content === "string") {
    const handle = await dir.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  } else {
    await writeBinaryFile(dir, fileName, content);
  }
}

function randomCheckpointId(): string {
  return `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCheckpoint(
  sandboxId: string,
  files: FileMap,
  dirs: string[],
  label?: string
): Promise<CheckpointMeta> {
  const id = randomCheckpointId();
  const meta: CheckpointMeta = {
    id,
    sandboxId,
    label: (label?.trim() || id).slice(0, 120),
    createdAt: new Date().toISOString(),
  };
  const projectRoot = await projectCheckpointDir(sandboxId);
  const cpDir = await projectRoot.getDirectoryHandle(id, { create: true });
  const filesDir = await cpDir.getDirectoryHandle("files", { create: true });
  // §8.4: default exclude `.git/**` (volume; restore workspace ≠ restore git history).
  const snapFiles = omitGitFromFileMap(files);
  const snapDirs = omitGitFromDirList(dirs);
  await writeJson(cpDir, "meta.json", meta);
  await writeJson(cpDir, "dirs.json", sortProjectPaths(snapDirs));
  for (const [path, content] of Object.entries(snapFiles)) {
    await writeFileAtPath(filesDir, path, content);
  }
  return meta;
}

export async function listCheckpoints(
  sandboxId: string
): Promise<CheckpointMeta[]> {
  try {
    const projectRoot = await projectCheckpointDir(sandboxId);
    const metas: CheckpointMeta[] = [];
    for await (const [name, handle] of projectRoot.entries()) {
      if (handle.kind !== "directory") continue;
      try {
        const meta = await readJson<CheckpointMeta>(
          handle as FileSystemDirectoryHandle,
          "meta.json"
        );
        if (meta?.id) metas.push(meta);
      } catch {
        /* skip broken */
      }
      void name;
    }
    return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function walkFiles(
  dir: FileSystemDirectoryHandle,
  prefix = ""
): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") out.push(path);
    else
      out.push(...(await walkFiles(handle as FileSystemDirectoryHandle, path)));
  }
  return out;
}

async function readFileBytes(
  root: FileSystemDirectoryHandle,
  path: string
): Promise<Uint8Array> {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop()!;
  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  const handle = await dir.getFileHandle(fileName);
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function loadCheckpointFiles(
  sandboxId: string,
  checkpointId: string
): Promise<{ files: FileMap; dirs: string[]; meta: CheckpointMeta }> {
  const projectRoot = await projectCheckpointDir(sandboxId);
  const cpDir = await projectRoot.getDirectoryHandle(checkpointId);
  const meta = await readJson<CheckpointMeta>(cpDir, "meta.json");
  const dirs = await readJson<string[]>(cpDir, "dirs.json").catch(() => []);
  const filesDir = await cpDir.getDirectoryHandle("files");
  const paths = await walkFiles(filesDir);
  const files: FileMap = {};
  for (const path of paths) {
    const bytes = await readFileBytes(filesDir, path);
    try {
      files[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      files[path] = bytes;
    }
  }
  return { files, dirs, meta };
}

/** Replace project contents with checkpoint snapshot (caller enforces agent_readonly). */
export async function restoreCheckpointIntoProject(
  sandboxId: string,
  checkpointId: string,
  currentFiles: string[],
  currentDirs: string[]
): Promise<{ files: FileMap; dirs: string[]; meta: CheckpointMeta }> {
  const { files, dirs, meta } = await loadCheckpointFiles(
    sandboxId,
    checkpointId
  );
  for (const path of currentFiles) {
    try {
      await deleteFile(sandboxId, path);
    } catch {
      /* ignore */
    }
  }
  for (const dir of [...currentDirs].sort(
    (a, b) => b.length - a.length || b.localeCompare(a)
  )) {
    try {
      await deleteDir(sandboxId, dir);
    } catch {
      /* ignore */
    }
  }
  for (const dir of dirs) {
    try {
      await createDir(sandboxId, dir);
    } catch {
      /* ignore */
    }
  }
  for (const [path, content] of Object.entries(files)) {
    await saveFile(sandboxId, path, content);
  }
  return { files, dirs, meta };
}

export async function clearCheckpointsForProject(
  sandboxId: string
): Promise<void> {
  try {
    const root = await checkpointsRoot();
    await root.removeEntry(sandboxId, { recursive: true });
  } catch {
    /* missing */
  }
}

/** Snapshot helpers using live OPFS project state. */
export async function snapshotProjectFromOpfs(
  sandboxId: string,
  label?: string
): Promise<CheckpointMeta> {
  const files = await loadProjectFiles(sandboxId);
  const dirs = await listProjectDirs(sandboxId);
  return createCheckpoint(sandboxId, files, dirs, label);
}
