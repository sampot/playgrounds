import {
  basename,
  filesUnderDir,
  isUnderDir,
  normalizeProjectPath,
  parentDir,
  rewritePathPrefix,
  sortProjectPaths,
} from "./pathUtils";
import {
  DEFAULT_ENTRY,
  LEGACY_META_FILENAME,
  META_FILENAME,
  bytesToFileContent,
  createStarterFiles,
  defaultMeta,
  isMetaFilename,
  peelMetaFromFileMap,
  pickEntry,
  type FileContent,
  type FileMap,
  type ProjectMeta,
} from "./projectTypes";
import {
  clearAdmittedCapabilities,
  setAdmittedCapabilities,
} from "./admittedCapabilities";
import {
  applySamHeadToolFields,
  projectToolFieldsFromFiles,
} from "./samHeadProjectMeta";
import { isTransientStorageError } from "./storageErrors";

const ROOT_DIR = "playgrounds-projects";
/** Pre-rename OPFS root; migrated into ROOT_DIR on first access. */
const LEGACY_ROOT_DIR = "web-ide-projects";

function randomId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 32) || "project";
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

/**
 * Safari／iOS (＜Safari 26) lack window `createWritable`; OPFS writes must run
 * in a Dedicated Worker via `createSyncAccessHandle` (Backend Runtime).
 */
export function mainThreadNeedsOpfsWorkerWrites(): boolean {
  if (typeof FileSystemFileHandle === "undefined") return false;
  const inWorker =
    typeof self !== "undefined" &&
    typeof (self as unknown as { importScripts?: unknown }).importScripts ===
      "function";
  if (inWorker) return false;
  return typeof FileSystemFileHandle.prototype.createWritable !== "function";
}

async function directoryHasEntries(
  dir: FileSystemDirectoryHandle
): Promise<boolean> {
  for await (const _ of dir.entries()) {
    return true;
  }
  return false;
}

/** Copy a file or directory tree into `dest` under `name`. */
async function copyEntry(
  source: FileSystemHandle,
  dest: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  if (source.kind === "file") {
    const file = await (source as FileSystemFileHandle).getFile();
    const out = await dest.getFileHandle(name, { create: true });
    const writable = await out.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return;
  }
  const srcDir = source as FileSystemDirectoryHandle;
  const outDir = await dest.getDirectoryHandle(name, { create: true });
  for await (const [childName, child] of srcDir.entries()) {
    await copyEntry(child, outDir, childName);
  }
}

async function migrateLegacyRoot(
  storageRoot: FileSystemDirectoryHandle,
  newRoot: FileSystemDirectoryHandle
): Promise<void> {
  if (await directoryHasEntries(newRoot)) return;
  let legacy: FileSystemDirectoryHandle;
  try {
    legacy = await storageRoot.getDirectoryHandle(LEGACY_ROOT_DIR);
  } catch {
    return;
  }
  for await (const [name, handle] of legacy.entries()) {
    try {
      await copyEntry(handle, newRoot, name);
    } catch {
      /* skip broken legacy entries */
    }
  }
}

async function rootDir(): Promise<FileSystemDirectoryHandle> {
  if (!isOpfsSupported()) {
    throw new Error("此瀏覽器不支援 OPFS（Origin Private File System）");
  }
  const storageRoot = await navigator.storage.getDirectory();
  const dir = await storageRoot.getDirectoryHandle(ROOT_DIR, { create: true });
  await migrateLegacyRoot(storageRoot, dir);
  return dir;
}

async function projectDir(
  id: string,
  create = false
): Promise<FileSystemDirectoryHandle> {
  const root = await rootDir();
  return root.getDirectoryHandle(id, { create });
}

async function ensureDir(
  base: FileSystemDirectoryHandle,
  dirPath: string
): Promise<FileSystemDirectoryHandle> {
  if (!dirPath) return base;
  let cur = base;
  for (const part of dirPath.split("/")) {
    cur = await cur.getDirectoryHandle(part, { create: true });
  }
  return cur;
}

async function contentToBytes(
  content: string | Uint8Array
): Promise<Uint8Array> {
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }
  return content;
}

async function writeBytesToFileHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array
): Promise<void> {
  const createSync = (
    handle as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<{
        truncate: (n: number) => void;
        write: (buf: BufferSource, opts?: { at?: number }) => number;
        flush: () => void;
        close: () => void;
      }>;
    }
  ).createSyncAccessHandle;

  // Dedicated Worker (and Safari): SyncAccessHandle.
  if (typeof createSync === "function") {
    const access = await createSync.call(handle);
    try {
      access.truncate(0);
      if (bytes.byteLength > 0) {
        access.write(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer,
          { at: 0 }
        );
      }
      access.flush();
    } finally {
      access.close();
    }
    return;
  }

  // Chrome／Safari 26+ window: createWritable.
  if (typeof handle.createWritable === "function") {
    const writable = await handle.createWritable();
    try {
      if (bytes.byteLength > 0) {
        await writable.write(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer
        );
      } else {
        await writable.write(new ArrayBuffer(0));
      }
      await writable.close();
    } catch (e) {
      try {
        await writable.abort();
      } catch {
        /* ignore */
      }
      throw e;
    }
    return;
  }

  throw new Error(
    "此瀏覽器無法在目前執行緒寫入 OPFS（需 SyncAccessHandle Worker 或 createWritable）"
  );
}

async function writeProjectFileOnce(
  dir: FileSystemDirectoryHandle,
  path: string,
  content: string | Uint8Array
): Promise<void> {
  const normalized = normalizeProjectPath(path);
  const dirPath = parentDir(normalized);
  const name = basename(normalized);
  const target = await ensureDir(dir, dirPath);
  const handle = await target.getFileHandle(name, { create: true });
  const bytes = await contentToBytes(content);
  await writeBytesToFileHandle(handle, bytes);
}

/** Write one file; retry brief UnknownError races common on mobile OPFS. */
async function writeProjectFile(
  dir: FileSystemDirectoryHandle,
  path: string,
  content: string | Uint8Array
): Promise<void> {
  const attempts = 3;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await writeProjectFileOnce(dir, path, content);
      return;
    } catch (e) {
      last = e;
      if (!isTransientStorageError(e) || i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 40 * (i + 1)));
    }
  }
  throw last;
}

async function readTextFile(
  dir: FileSystemDirectoryHandle,
  path: string
): Promise<string> {
  const normalized = normalizeProjectPath(path);
  const dirPath = parentDir(normalized);
  const name = basename(normalized);
  let cur = dir;
  if (dirPath) {
    for (const part of dirPath.split("/")) {
      cur = await cur.getDirectoryHandle(part);
    }
  }
  const handle = await cur.getFileHandle(name);
  const file = await handle.getFile();
  return file.text();
}

async function readProjectFile(
  dir: FileSystemDirectoryHandle,
  path: string
): Promise<string | Uint8Array> {
  const normalized = normalizeProjectPath(path);
  const dirPath = parentDir(normalized);
  const name = basename(normalized);
  let cur = dir;
  if (dirPath) {
    for (const part of dirPath.split("/")) {
      cur = await cur.getDirectoryHandle(part);
    }
  }
  const handle = await cur.getFileHandle(name);
  const file = await handle.getFile();
  const buf = new Uint8Array(await file.arrayBuffer());
  return bytesToFileContent(normalized, buf);
}

async function removeEntry(
  dir: FileSystemDirectoryHandle,
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  const normalized = normalizeProjectPath(path);
  const dirPath = parentDir(normalized);
  const name = basename(normalized);
  let cur = dir;
  if (dirPath) {
    for (const part of dirPath.split("/")) {
      cur = await cur.getDirectoryHandle(part);
    }
  }
  await cur.removeEntry(name, { recursive: options?.recursive === true });
}

async function walkFiles(
  dir: FileSystemDirectoryHandle,
  prefix = ""
): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "directory") {
      out.push(...(await walkFiles(handle as FileSystemDirectoryHandle, path)));
    } else if (!isMetaFilename(name)) {
      out.push(path);
    }
  }
  return out;
}

/** All directory paths in the project (includes empty dirs kept in OPFS). */
async function walkDirs(
  dir: FileSystemDirectoryHandle,
  prefix = ""
): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== "directory") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    out.push(path);
    out.push(...(await walkDirs(handle as FileSystemDirectoryHandle, path)));
  }
  return out;
}

async function touchMeta(id: string): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  const meta = await readMeta(id);
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

export async function readMeta(id: string): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  try {
    const text = await readTextFile(dir, META_FILENAME);
    return JSON.parse(text) as ProjectMeta;
  } catch {
    const text = await readTextFile(dir, LEGACY_META_FILENAME);
    const meta = JSON.parse(text) as ProjectMeta;
    await writeMeta(dir, meta);
    try {
      await removeEntry(dir, LEGACY_META_FILENAME);
    } catch {
      /* keep legacy if delete fails */
    }
    return meta;
  }
}

async function writeMeta(dir: FileSystemDirectoryHandle, meta: ProjectMeta) {
  await writeProjectFile(dir, META_FILENAME, JSON.stringify(meta, null, 2));
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const root = await rootDir();
  const metas: ProjectMeta[] = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory") continue;
    try {
      metas.push(await readMeta(name));
    } catch {
      /* skip broken project dirs */
    }
  }
  return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(
  name: string,
  files?: FileMap,
  partialMeta?: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  const id = partialMeta?.id || randomId(name);
  const fileMap = peelMetaFromFileMap(files ?? createStarterFiles()).files;
  const fromHead = projectToolFieldsFromFiles(fileMap);
  const entry = pickEntry(fileMap, partialMeta?.entry);
  // Head is sole authority for tool discovery when index.html is in the map.
  // Ignore any toolKinds／toolGlobs on partialMeta (may be stale side-ledger).
  // Never inherit admittedCapabilities on create (DEC-036 — re-admit after import／clone).
  const partialRest: Partial<ProjectMeta> = { ...(partialMeta ?? {}) };
  delete partialRest.toolKinds;
  delete partialRest.toolGlobs;
  delete partialRest.admittedCapabilities;
  const headToolFields =
    fromHead === null
      ? {}
      : {
          toolKinds: fromHead.toolKinds,
          toolGlobs: fromHead.toolGlobs,
        };
  const meta = defaultMeta(id, name, {
    ...partialRest,
    ...headToolFields,
    id,
    name,
    entry,
  });
  const dir = await projectDir(id, true);
  await writeMeta(dir, meta);
  for (const [path, content] of Object.entries(fileMap)) {
    await writeProjectFile(dir, path, content);
  }
  return meta;
}

/** Default display name for an OPFS project clone (pure; testable). */
export function defaultCloneProjectName(sourceName: string): string {
  const base = sourceName.trim() || "沙盒";
  return `${base} 副本`;
}

/**
 * Deep-copy an OPFS project (files + empty dirs) into a new id / name.
 * Does not copy Durable KV / DB / Secrets — callers use `copyProjectState`
 * when the user/HOST opts in (stateful SAM move).
 * `partialMeta` can set `agentManaged` (HOST clones) without inheriting the
 * source flag — UI clones stay user-owned unless explicitly marked.
 */
export async function cloneProject(
  sourceId: string,
  newName?: string,
  partialMeta?: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  const src = await readMeta(sourceId);
  const files = await loadProjectFiles(sourceId);
  const dirs = await listProjectDirs(sourceId);
  const name = (newName?.trim() || defaultCloneProjectName(src.name)).trim();
  // Lineage: clonedFrom defaults to source; caller may override.
  // Do not inherit source inWorkingSet / cloneIntent / agentManaged.
  // toolKinds／toolGlobs re-derived from cloned index.html head inside createProject.
  const meta = await createProject(name, files, {
    source: src.source,
    entry: src.entry,
    clonedFrom: sourceId,
    ...partialMeta,
  });
  for (const dirPath of dirs) {
    try {
      await createDir(meta.id, dirPath);
    } catch {
      /* dir may already exist via parent files */
    }
  }
  return meta;
}

export async function deleteProject(id: string): Promise<void> {
  clearAdmittedCapabilities(id);
  const root = await rootDir();
  await root.removeEntry(id, { recursive: true });
}

export async function loadProjectFiles(id: string): Promise<FileMap> {
  const dir = await projectDir(id);
  const paths = await walkFiles(dir);
  const files: FileMap = {};
  for (const path of paths) {
    files[path] = await readProjectFile(dir, path);
  }
  return files;
}

/** Read one project-relative file; `undefined` if missing. */
export async function loadFile(
  id: string,
  path: string
): Promise<FileContent | undefined> {
  const dir = await projectDir(id);
  try {
    return await readProjectFile(dir, normalizeProjectPath(path));
  } catch {
    return undefined;
  }
}

/** Directory paths present in OPFS (including empty directories). */
export async function listProjectDirs(id: string): Promise<string[]> {
  const dir = await projectDir(id);
  return sortProjectPaths(await walkDirs(dir));
}

/**
 * Create an (possibly empty) directory in OPFS.
 * Empty dirs persist without placeholder files.
 */
export async function createDir(
  id: string,
  path: string
): Promise<ProjectMeta> {
  const normalized = normalizeProjectPath(path);
  if (!normalized) throw new Error("目錄路徑無效");
  const files = await loadProjectFiles(id);
  if (normalized in files) {
    throw new Error("已有同名檔案");
  }
  const dir = await projectDir(id);
  await ensureDir(dir, normalized);
  return touchMeta(id);
}

export async function deleteDir(
  id: string,
  path: string
): Promise<ProjectMeta> {
  const normalized = normalizeProjectPath(path);
  if (!normalized) throw new Error("目錄路徑無效");
  const dir = await projectDir(id);
  await removeEntry(dir, normalized, { recursive: true });
  const meta = await readMeta(id);
  if (isUnderDir(meta.entry, normalized)) {
    meta.entry = DEFAULT_ENTRY;
  }
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

export async function renameDir(
  id: string,
  from: string,
  to: string
): Promise<ProjectMeta> {
  const fromN = normalizeProjectPath(from);
  const toN = normalizeProjectPath(to);
  if (!fromN || !toN) throw new Error("目錄路徑無效");
  if (fromN === toN) return readMeta(id);
  if (isUnderDir(toN, fromN) && toN !== fromN) {
    throw new Error("不可將目錄移到自己底下");
  }

  const files = await loadProjectFiles(id);
  const dirs = await listProjectDirs(id);
  if (
    !dirs.includes(fromN) &&
    filesUnderDir(Object.keys(files), fromN).length === 0
  ) {
    throw new Error(`找不到目錄：${from}`);
  }
  if (toN in files) {
    throw new Error("目標路徑已有同名檔案");
  }
  if (dirs.includes(toN)) {
    throw new Error("目標目錄已存在");
  }
  for (const p of Object.keys(files)) {
    if (!isUnderDir(p, fromN) || p === fromN) continue;
    const next = rewritePathPrefix(p, fromN, toN);
    if (next in files && !isUnderDir(next, fromN)) {
      throw new Error(`目標與既有檔案衝突：${next}`);
    }
  }

  const dir = await projectDir(id);
  await ensureDir(dir, toN);

  const moving = filesUnderDir(Object.keys(files), fromN);
  for (const p of moving) {
    const next = rewritePathPrefix(p, fromN, toN);
    await writeProjectFile(dir, next, files[p]!);
  }

  // Preserve empty subdirectories under the renamed folder.
  for (const d of dirs) {
    if (!isUnderDir(d, fromN)) continue;
    const next = rewritePathPrefix(d, fromN, toN);
    await ensureDir(dir, next);
  }

  await removeEntry(dir, fromN, { recursive: true });

  const meta = await readMeta(id);
  meta.entry = DEFAULT_ENTRY;
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

/** Write many files (e.g. OS upload) without replacing the whole project. */
export async function writeFiles(
  id: string,
  patch: FileMap
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  for (const [path, content] of Object.entries(patch)) {
    await writeProjectFile(dir, path, content);
  }
  const meta = await readMeta(id);
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

export async function saveFile(
  id: string,
  path: string,
  content: FileContent
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  const normalized = normalizeProjectPath(path);
  await writeProjectFile(dir, path, content);
  let meta = await readMeta(id);
  meta.updatedAt = new Date().toISOString();
  if (normalized === DEFAULT_ENTRY && typeof content === "string") {
    meta = applySamHeadToolFields(meta, content);
  }
  await writeMeta(dir, meta);
  return meta;
}

export async function writeAllFiles(
  id: string,
  files: FileMap
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  for (const [path, content] of Object.entries(files)) {
    await writeProjectFile(dir, path, content);
  }
  let meta = await readMeta(id);
  meta.entry = pickEntry(files, meta.entry);
  meta.updatedAt = new Date().toISOString();
  const html = files[DEFAULT_ENTRY];
  if (typeof html === "string") {
    meta = applySamHeadToolFields(meta, html);
  }
  await writeMeta(dir, meta);
  return meta;
}

export async function deleteFile(
  id: string,
  path: string
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  await removeEntry(dir, path);
  const meta = await readMeta(id);
  if (meta.entry === normalizeProjectPath(path)) {
    meta.entry = DEFAULT_ENTRY;
  }
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

export async function renameFile(
  id: string,
  from: string,
  to: string
): Promise<ProjectMeta> {
  const content = (await loadProjectFiles(id))[normalizeProjectPath(from)];
  if (content === undefined) {
    throw new Error(`找不到檔案：${from}`);
  }
  const dir = await projectDir(id);
  await writeProjectFile(dir, to, content);
  await removeEntry(dir, from);
  const meta = await readMeta(id);
  meta.entry = DEFAULT_ENTRY;
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  return meta;
}

export async function updateProjectMeta(
  id: string,
  patch: Partial<ProjectMeta>
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  const meta = { ...(await readMeta(id)), ...patch, id };
  meta.updatedAt = new Date().toISOString();
  await writeMeta(dir, meta);
  if ("admittedCapabilities" in patch) {
    setAdmittedCapabilities(id, meta.admittedCapabilities);
  }
  return meta;
}

/**
 * Re-mirror `sam:tool-*` from OPFS index.html into the host side ledger.
 * Does not bump `updatedAt` (discovery refresh only).
 */
export async function syncProjectToolMetaFromHead(
  id: string
): Promise<ProjectMeta> {
  const dir = await projectDir(id);
  const files = await loadProjectFiles(id);
  const html = files[DEFAULT_ENTRY];
  let meta = await readMeta(id);
  if (typeof html !== "string") return meta;
  const next = applySamHeadToolFields(meta, html);
  if (
    JSON.stringify(next.toolKinds ?? null) ===
      JSON.stringify(meta.toolKinds ?? null) &&
    JSON.stringify(next.toolGlobs ?? null) ===
      JSON.stringify(meta.toolGlobs ?? null)
  ) {
    return meta;
  }
  meta = next;
  await writeMeta(dir, meta);
  return meta;
}
