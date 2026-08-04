/**
 * OPFS-backed WASI preopen (DEC-039).
 * Uses `@bjorn3/browser_wasi_shim` SyncOPFSFile + mem Directory tree.
 * Async prep / finish; synchronous I/O during `wasi.start()`.
 */

import {
  Directory,
  File,
  PreopenDirectory,
  SyncOPFSFile,
  wasi,
  type Inode,
} from "@bjorn3/browser_wasi_shim";
import { isMetaFilename } from "./projectTypes";

export type SyncAccessHandleLike = {
  close(): void;
  flush(): void;
  getSize(): number;
  read(buffer: ArrayBuffer | ArrayBufferView, options?: { at: number }): number;
  truncate(to: number): void;
  write(
    buffer: ArrayBuffer | ArrayBufferView,
    options?: { at: number }
  ): number;
};

/** SyncOPFSFile that records writes／truncates for dirty-path reporting. */
export class DirtySyncOPFSFile extends SyncOPFSFile {
  readonly relPath: string;
  dirty = false;

  constructor(relPath: string, handle: SyncAccessHandleLike) {
    super(handle);
    this.relPath = relPath;
  }

  override path_open(
    oflags: number,
    fs_rights_base: bigint,
    fd_flags: number
  ): { ret: number; fd_obj: ReturnType<SyncOPFSFile["path_open"]>["fd_obj"] } {
    if ((oflags & wasi.OFLAGS_TRUNC) === wasi.OFLAGS_TRUNC) {
      this.dirty = true;
    }
    const opened = super.path_open(oflags, fs_rights_base, fd_flags);
    if (!opened.fd_obj) return opened;
    const fd = opened.fd_obj;
    const mark = () => {
      this.dirty = true;
    };
    const write = fd.fd_write.bind(fd);
    fd.fd_write = (data: Uint8Array) => {
      mark();
      return write(data);
    };
    const setSize = fd.fd_filestat_set_size.bind(fd);
    fd.fd_filestat_set_size = (size: bigint) => {
      mark();
      return setSize(size);
    };
    const allocate = fd.fd_allocate.bind(fd);
    fd.fd_allocate = (offset: bigint, len: bigint) => {
      mark();
      return allocate(offset, len);
    };
    return opened;
  }
}

export type OpfsPreopenSession = {
  preopen: PreopenDirectory;
  /** Flush dirty／new files, apply deletes, close handles. Paths relative to project root. */
  finish: () => Promise<{
    changedPaths: string[];
    deletedPaths: string[];
  }>;
};

function joinRel(cwd: string, rel: string): string {
  if (!cwd) return rel;
  if (!rel) return cwd;
  return `${cwd}/${rel}`;
}

async function resolveCwdDir(
  projectDir: FileSystemDirectoryHandle,
  cwd: string
): Promise<FileSystemDirectoryHandle> {
  if (!cwd) return projectDir;
  let cur = projectDir;
  for (const part of cwd.split("/").filter(Boolean)) {
    cur = await cur.getDirectoryHandle(part, { create: false });
  }
  return cur;
}

async function ensureChildDir(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true });
}

async function writeBytesToOpfsFile(
  parent: FileSystemDirectoryHandle,
  name: string,
  bytes: Uint8Array
): Promise<void> {
  const fh = await parent.getFileHandle(name, { create: true });
  // Prefer SyncAccessHandle when available (Worker); fall back to createWritable.
  const maybeSync = (
    fh as FileSystemFileHandle & {
      createSyncAccessHandle?: () => Promise<SyncAccessHandleLike>;
    }
  ).createSyncAccessHandle;
  if (typeof maybeSync === "function") {
    const h = await maybeSync.call(fh);
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
      bytes.byteLength
        ? (bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ) as ArrayBuffer)
        : new ArrayBuffer(0)
    );
  } finally {
    await w.close();
  }
}

async function removeChild(
  parent: FileSystemDirectoryHandle,
  name: string,
  recursive: boolean
): Promise<void> {
  await parent.removeEntry(name, { recursive });
}

/**
 * Walk OPFS directory into a WASI Directory of DirtySyncOPFSFile / Directory.
 * Does not load file bodies into JS heaps — only SyncAccessHandles.
 */
export async function buildDirectoryFromOpfs(
  dir: FileSystemDirectoryHandle,
  pathPrefix: string,
  handles: DirtySyncOPFSFile[]
): Promise<Directory> {
  const contents = new Map<string, Inode>();
  for await (const [name, handle] of dir.entries()) {
    if (isMetaFilename(name)) continue;
    const rel = pathPrefix ? `${pathPrefix}/${name}` : name;
    if (handle.kind === "directory") {
      contents.set(
        name,
        await buildDirectoryFromOpfs(
          handle as FileSystemDirectoryHandle,
          rel,
          handles
        )
      );
    } else {
      const fh = handle as FileSystemFileHandle;
      const createSync = (
        fh as FileSystemFileHandle & {
          createSyncAccessHandle?: () => Promise<SyncAccessHandleLike>;
        }
      ).createSyncAccessHandle;
      if (typeof createSync !== "function") {
        throw new Error(
          "此環境不支援 FileSystemSyncAccessHandle（需 Dedicated Worker 內 OPFS）"
        );
      }
      const access = await createSync.call(fh);
      const file = new DirtySyncOPFSFile(rel, access);
      handles.push(file);
      contents.set(name, file);
    }
  }
  return new Directory(contents);
}

function collectFinalFilePaths(
  dir: Directory,
  prefix: string,
  out: Set<string>
): void {
  for (const [name, inode] of dir.contents) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (inode instanceof Directory) {
      collectFinalFilePaths(inode, rel, out);
    } else {
      out.add(rel);
    }
  }
}

async function persistTreeToOpfs(
  dir: Directory,
  opfsDir: FileSystemDirectoryHandle,
  prefix: string,
  changed: Set<string>
): Promise<void> {
  for (const [name, inode] of dir.contents) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (inode instanceof Directory) {
      const child = await ensureChildDir(opfsDir, name);
      await persistTreeToOpfs(inode, child, rel, changed);
      continue;
    }
    if (inode instanceof DirtySyncOPFSFile) {
      try {
        inode.handle.flush();
      } catch {
        /* ignore flush errors on close path */
      }
      if (inode.dirty) changed.add(rel);
      continue;
    }
    if (inode instanceof File) {
      await writeBytesToOpfsFile(opfsDir, name, inode.data);
      changed.add(rel);
    }
  }
}

async function applyDeletes(
  root: FileSystemDirectoryHandle,
  cwdPrefix: string,
  deletedRelToPreopen: string[]
): Promise<string[]> {
  const deletedProjectPaths: string[] = [];
  for (const rel of deletedRelToPreopen) {
    const projectRel = joinRel(cwdPrefix, rel);
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    let cur = root;
    try {
      for (let i = 0; i < parts.length - 1; i++) {
        cur = await cur.getDirectoryHandle(parts[i]!);
      }
      await removeChild(cur, parts[parts.length - 1]!, false);
      deletedProjectPaths.push(projectRel);
    } catch {
      /* already gone */
    }
  }
  return deletedProjectPaths;
}

/**
 * Open project OPFS root (`playgrounds-projects/<id>`), optionally under cwd,
 * and build a PreopenDirectory for WASI.
 */
export async function openOpfsPreopenSession(options: {
  projectDir: FileSystemDirectoryHandle;
  /** Normalized cwd relative to project root; empty = root. */
  cwd: string;
}): Promise<OpfsPreopenSession> {
  const handles: DirtySyncOPFSFile[] = [];
  const cwdDir = await resolveCwdDir(options.projectDir, options.cwd);
  const tree = await buildDirectoryFromOpfs(cwdDir, "", handles);
  const initialPaths = new Set(handles.map(h => h.relPath));
  const preopen = new PreopenDirectory("/", tree.contents);

  return {
    preopen,
    async finish() {
      const finalPaths = new Set<string>();
      collectFinalFilePaths(preopen.dir, "", finalPaths);

      const deletedRel: string[] = [];
      for (const p of initialPaths) {
        if (!finalPaths.has(p)) deletedRel.push(p);
      }

      const changedRel = new Set<string>();
      await persistTreeToOpfs(preopen.dir, cwdDir, "", changedRel);

      for (const h of handles) {
        try {
          h.handle.close();
        } catch {
          /* already closed */
        }
      }

      const deletedPaths = await applyDeletes(cwdDir, options.cwd, deletedRel);

      const changedPaths = [...changedRel].map(p => joinRel(options.cwd, p));
      return { changedPaths, deletedPaths };
    },
  };
}

/** Resolve `playgrounds-projects/<projectId>` (same layout as opfsStore). */
export async function resolvePlaygroundsProjectDir(
  projectId: string
): Promise<FileSystemDirectoryHandle> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.getDirectory !== "function"
  ) {
    throw new Error("此瀏覽器不支援 OPFS");
  }
  const storageRoot = await navigator.storage.getDirectory();
  const root = await storageRoot.getDirectoryHandle("playgrounds-projects", {
    create: false,
  });
  return root.getDirectoryHandle(projectId, { create: false });
}

export function supportsSyncAccessHandle(): boolean {
  return (
    typeof FileSystemFileHandle !== "undefined" &&
    typeof FileSystemFileHandle.prototype.createSyncAccessHandle === "function"
  );
}
