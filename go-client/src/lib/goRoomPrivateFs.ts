/**
 * Host private media library — pg-booth-desktop native FS via Tauri plugin-fs.
 * Layout aligns with booth-storage / OPFS: manifest.json + files/pvt_*.
 * PG-GO-ROOM-TAURI-PLAN §7.4.
 */

import { boothDesktopPaths } from "./boothDesktop";
import {
  GO_ROOM_PRIVATE_FILES_DIR,
  GO_ROOM_PRIVATE_MANIFEST,
  GO_ROOM_PRIVATE_UNSUPPORTED,
  isRoomPrivateFileId,
  newRoomPrivateFileId,
  parseRoomPrivateManifest,
  sanitizeRoomPrivateName,
  type RoomPrivateEntry,
  type RoomPrivateImportResult,
  type RoomPrivateLibrary,
  type RoomPrivateOpenStreamResult,
  type RoomPrivateStreamWriter,
} from "./goRoomPrivateTypes";

export type RoomPrivateFsIo = {
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  writeFile(
    path: string,
    data: Uint8Array,
    opts?: { append?: boolean }
  ): Promise<void>;
  writeText(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
};

export type RoomPrivateFsDeps = RoomPrivateFsIo & {
  rootDir: string;
  newId?: () => string;
  now?: () => number;
};

function joinPath(root: string, ...parts: string[]): string {
  const base = root.replace(/\/+$/, "");
  return parts.reduce(
    (path, part) => `${path}/${part.replace(/^\/+/, "")}`,
    base
  );
}

async function defaultFsIo(): Promise<RoomPrivateFsIo> {
  const fs = await import("@tauri-apps/plugin-fs");
  return {
    async mkdir(path: string) {
      await fs.mkdir(path, { recursive: true });
    },
    async exists(path: string) {
      return await fs.exists(path);
    },
    async readFile(path: string) {
      return await fs.readFile(path);
    },
    async readText(path: string) {
      return await fs.readTextFile(path);
    },
    async writeFile(path, data, opts) {
      await fs.writeFile(path, data, {
        create: true,
        append: opts?.append ?? false,
      });
    },
    async writeText(path, text) {
      await fs.writeTextFile(path, text, { create: true });
    },
    async remove(path) {
      await fs.remove(path);
    },
  };
}

async function defaultRootDir(): Promise<string> {
  const paths = await boothDesktopPaths();
  const dir = paths?.privateLibraryDir?.trim();
  if (!dir) throw new Error("booth_paths missing privateLibraryDir");
  return dir;
}

export function createRoomPrivateFsLibrary(
  deps: Partial<RoomPrivateFsDeps> & { rootDir?: string } = {}
): RoomPrivateLibrary {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => randomHex());
  let rootPromise: Promise<string> | null = deps.rootDir
    ? Promise.resolve(deps.rootDir)
    : null;
  let ioPromise: Promise<RoomPrivateFsIo> | null =
    deps.mkdir && deps.readFile && deps.writeFile && deps.writeText && deps.remove
      ? Promise.resolve({
          mkdir: deps.mkdir,
          exists: deps.exists ?? (async () => false),
          readFile: deps.readFile,
          readText:
            deps.readText ??
            (async (path: string) =>
              new TextDecoder().decode(await deps.readFile!(path))),
          writeFile: deps.writeFile,
          writeText: deps.writeText,
          remove: deps.remove,
        })
      : null;

  async function root(): Promise<string> {
    if (!rootPromise) rootPromise = defaultRootDir();
    return rootPromise;
  }

  async function io(): Promise<RoomPrivateFsIo> {
    if (!ioPromise) ioPromise = defaultFsIo();
    return ioPromise;
  }

  async function ensureLayout(base: string, fs: RoomPrivateFsIo): Promise<void> {
    await fs.mkdir(joinPath(base, GO_ROOM_PRIVATE_FILES_DIR));
  }

  async function readManifest(
    base: string,
    fs: RoomPrivateFsIo
  ): Promise<RoomPrivateEntry[]> {
    const manifestPath = joinPath(base, GO_ROOM_PRIVATE_MANIFEST);
    try {
      if (!(await fs.exists(manifestPath))) return [];
      const raw = JSON.parse(await fs.readText(manifestPath)) as unknown;
      return parseRoomPrivateManifest(raw);
    } catch {
      return [];
    }
  }

  async function writeManifest(
    base: string,
    fs: RoomPrivateFsIo,
    entries: RoomPrivateEntry[]
  ): Promise<void> {
    await fs.writeText(
      joinPath(base, GO_ROOM_PRIVATE_MANIFEST),
      JSON.stringify(entries)
    );
  }

  return {
    supported: true,
    async list() {
      try {
        const base = await root();
        const fsApi = await io();
        return await readManifest(base, fsApi);
      } catch {
        return [];
      }
    },
    async importFile(file) {
      try {
        const base = await root();
        const fsApi = await io();
        await ensureLayout(base, fsApi);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeRoomPrivateName(file.name),
          mime: file.type || "application/octet-stream",
          size: file.size,
          createdAt: now(),
        };
        const blobPath = joinPath(base, GO_ROOM_PRIVATE_FILES_DIR, id);
        if (typeof file.stream === "function") {
          const reader = file.stream().getReader();
          let appended = false;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            await fsApi.writeFile(blobPath, value, { append: appended });
            appended = true;
          }
        } else {
          await fsApi.writeFile(
            blobPath,
            new Uint8Array(await file.arrayBuffer())
          );
        }
        const entries = await readManifest(base, fsApi);
        entries.push(entry);
        await writeManifest(base, fsApi, entries);
        return { ok: true, entry };
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "無法寫入私有片庫";
        return { ok: false, error: msg };
      }
    },
    async openStreamWrite(opts) {
      try {
        const base = await root();
        const fsApi = await io();
        await ensureLayout(base, fsApi);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeRoomPrivateName(opts.name),
          mime: opts.mime || "application/octet-stream",
          size: 0,
          createdAt: now(),
        };
        const blobPath = joinPath(base, GO_ROOM_PRIVATE_FILES_DIR, id);
        let size = 0;
        let closed = false;
        let appended = false;
        const writer: RoomPrivateStreamWriter = {
          id,
          async writeChunk(chunk) {
            if (closed) return;
            const data = new Uint8Array(await chunk.arrayBuffer());
            await fsApi.writeFile(blobPath, data, { append: appended });
            appended = true;
            size += chunk.size;
          },
          async finalize() {
            if (closed) {
              return { ok: false, error: "錄影已結束" };
            }
            closed = true;
            const done: RoomPrivateEntry = { ...entry, size };
            const entries = await readManifest(base, fsApi);
            entries.push(done);
            await writeManifest(base, fsApi, entries);
            return { ok: true, entry: done };
          },
          async abort() {
            if (closed) return;
            closed = true;
            try {
              await fsApi.remove(blobPath);
            } catch {
              /* ignore */
            }
          },
        };
        return { ok: true, writer };
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "無法寫入私有片庫";
        return { ok: false, error: msg };
      }
    },
    async getFile(id) {
      if (!isRoomPrivateFileId(id)) return null;
      try {
        const base = await root();
        const fsApi = await io();
        const entries = await readManifest(base, fsApi);
        const meta = entries.find((e) => e.id === id);
        if (!meta) return null;
        const bytes = await fsApi.readFile(
          joinPath(base, GO_ROOM_PRIVATE_FILES_DIR, id)
        );
        const blob = new Blob([Uint8Array.from(bytes)], {
          type: meta.mime || "application/octet-stream",
        });
        return new File([blob], meta.name, {
          type: meta.mime || "application/octet-stream",
          lastModified: meta.createdAt,
        });
      } catch {
        return null;
      }
    },
    async remove(id) {
      if (!isRoomPrivateFileId(id)) return;
      try {
        const base = await root();
        const fsApi = await io();
        const entries = (await readManifest(base, fsApi)).filter(
          (e) => e.id !== id
        );
        await writeManifest(base, fsApi, entries);
        try {
          await fsApi.remove(joinPath(base, GO_ROOM_PRIVATE_FILES_DIR, id));
        } catch {
          /* missing blob ok */
        }
      } catch {
        /* ignore */
      }
    },
    async clear() {
      try {
        const base = await root();
        const fsApi = await io();
        const entries = await readManifest(base, fsApi);
        for (const e of entries) {
          try {
            await fsApi.remove(joinPath(base, GO_ROOM_PRIVATE_FILES_DIR, e.id));
          } catch {
            /* ignore */
          }
        }
        await writeManifest(base, fsApi, []);
      } catch {
        /* ignore */
      }
    },
  };
}

function randomHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @deprecated Use createHostPrivateLibrary */
export function createRoomPrivateLibraryFromFs(
  deps?: Partial<RoomPrivateFsDeps>
): RoomPrivateLibrary {
  return createRoomPrivateFsLibrary(deps);
}

export { GO_ROOM_PRIVATE_UNSUPPORTED };
