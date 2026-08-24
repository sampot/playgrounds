/**
 * Host share directory — pg-booth-desktop native FS via Tauri plugin-fs.
 * Flat files only (ROOM §5.5 — no kind:dir wire).
 */

import { boothDesktopPaths } from "./boothDesktop";
import {
  isShareDirFileId,
  normalizeShareRelativePath,
  shareFileIdForPath,
  type HostShareLibrary,
  type ShareLibraryFile,
} from "./goRoomShareTypes";
import { isBlockedSessionFileName } from "@pg/roster/rosterSessionFile";
import { roomFileContentType } from "./goRoomPlayRegistry";

export type ShareFsIo = {
  exists(path: string): Promise<boolean>;
  readDir(path: string): Promise<Array<{ name: string; isDirectory: boolean }>>;
  readFile(path: string): Promise<Uint8Array>;
  statSize(path: string): Promise<number>;
};

function joinPath(root: string, ...parts: string[]): string {
  const sep = root.includes("\\") ? "\\" : "/";
  return [root, ...parts]
    .join(sep)
    .replace(/[/\\]+/g, sep);
}

async function defaultFsIo(): Promise<ShareFsIo> {
  const fs = await import("@tauri-apps/plugin-fs");
  return {
    exists: (path) => fs.exists(path),
    readDir: async (path) => {
      const entries = await fs.readDir(path);
      return entries.map((e) => ({
        name: e.name,
        isDirectory: e.isDirectory,
      }));
    },
    readFile: (path) => fs.readFile(path),
    statSize: async (path) => {
      const data = await fs.readFile(path);
      return data.byteLength;
    },
  };
}

async function defaultShareRoot(): Promise<string> {
  const paths = await boothDesktopPaths();
  const dir =
    paths?.shareLibraryDir?.trim() ||
    (paths?.dataDir?.trim() ? joinPath(paths.dataDir.trim(), "share") : "");
  if (!dir) throw new Error("booth_paths missing shareLibraryDir");
  return dir.replace(/[/\\]+$/, "");
}

export function createRoomShareFsLibrary(
  deps: {
    rootDir?: string;
    io?: ShareFsIo;
    shareRoot?: () => Promise<string>;
  } = {}
): HostShareLibrary {
  let rootPromise: Promise<string> | null = deps.rootDir
    ? Promise.resolve(deps.rootDir)
    : null;
  let ioPromise: Promise<ShareFsIo> | null = deps.io
    ? Promise.resolve(deps.io)
    : null;

  async function root(): Promise<string> {
    if (!rootPromise) {
      rootPromise = deps.shareRoot ? deps.shareRoot() : defaultShareRoot();
    }
    return rootPromise;
  }

  async function io(): Promise<ShareFsIo> {
    ioPromise ??= defaultFsIo();
    return ioPromise;
  }

  return {
    supported: true,
    async shareLibraryDir() {
      try {
        return await root();
      } catch {
        return null;
      }
    },
    async scan() {
      const base = await root();
      const fsApi = await io();
      if (!(await fsApi.exists(base))) return [];
      const names = await fsApi.readDir(base);
      const out: ShareLibraryFile[] = [];
      for (const entry of names) {
        if (entry.isDirectory) continue;
        const name = entry.name.trim();
        if (!name || name.startsWith(".")) continue;
        if (isBlockedSessionFileName(name)) continue;
        const relativePath = normalizeShareRelativePath(name);
        const fullPath = joinPath(base, name);
        const size = await fsApi.statSize(fullPath);
        if (!size) continue;
        out.push({
          id: shareFileIdForPath(relativePath),
          relativePath,
          name,
          size,
          mime: roomFileContentType("", name) || undefined,
        });
      }
      out.sort((a, b) => a.name.localeCompare(b.name));
      return out;
    },
    async loadFile(entry) {
      if (!isShareDirFileId(entry.id)) {
        throw new Error("invalid_share_entry");
      }
      const base = await root();
      const fsApi = await io();
      const fullPath = joinPath(base, entry.name);
      const bytes = await fsApi.readFile(fullPath);
      const mime = entry.mime || roomFileContentType("", entry.name) || "application/octet-stream";
      return new File([Uint8Array.from(bytes)], entry.name, { type: mime });
    },
  };
}
