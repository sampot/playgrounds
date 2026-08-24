/**
 * Host private media library — Embedded Hub OPFS backend.
 * PG-GO-ROOM-PLAN §5.5.1／§8.3. Desktop uses goRoomPrivateFs (TAURI-PLAN §7.4).
 */

import {
  GO_ROOM_PRIVATE_FILES_DIR,
  GO_ROOM_PRIVATE_MANIFEST,
  GO_ROOM_PRIVATE_OPFS_ROOT,
  GO_ROOM_PRIVATE_UNSUPPORTED_OPFS,
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

export {
  GO_ROOM_PRIVATE_ID_PREFIX,
  GO_ROOM_PRIVATE_OPFS_ROOT,
  GO_ROOM_PRIVATE_UNSUPPORTED_OPFS as GO_ROOM_PRIVATE_UNSUPPORTED,
  isRoomPrivateFileId,
  newRoomPrivateFileId,
  type RoomPrivateEntry,
  type RoomPrivateImportResult,
  type RoomPrivateLibrary,
  type RoomPrivateOpenStreamResult,
  type RoomPrivateStreamWriter,
} from "./goRoomPrivateTypes";

export type RoomPrivateOpfsDeps = {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  isSupported?: () => boolean;
  newId?: () => string;
  /** Test hook — must never be called on the happy path. */
  registerShareLocal?: (id: string, file: File) => void;
  now?: () => number;
};

function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.storage?.getDirectory)
  );
}

export function createRoomPrivateOpfsLibrary(
  deps: RoomPrivateOpfsDeps = {}
): RoomPrivateLibrary {
  const supported = (deps.isSupported ?? isOpfsSupported)();
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => randomHex());

  async function root(): Promise<FileSystemDirectoryHandle> {
    const getDirectory =
      deps.getDirectory ?? (() => navigator.storage.getDirectory());
    const storageRoot = await getDirectory();
    return storageRoot.getDirectoryHandle(GO_ROOM_PRIVATE_OPFS_ROOT, {
      create: true,
    });
  }

  async function filesDir(
    base: FileSystemDirectoryHandle
  ): Promise<FileSystemDirectoryHandle> {
    return base.getDirectoryHandle(GO_ROOM_PRIVATE_FILES_DIR, { create: true });
  }

  async function readManifest(
    base: FileSystemDirectoryHandle
  ): Promise<RoomPrivateEntry[]> {
    try {
      const fh = await base.getFileHandle(GO_ROOM_PRIVATE_MANIFEST);
      const file = await fh.getFile();
      const raw = JSON.parse(await file.text()) as unknown;
      return parseRoomPrivateManifest(raw);
    } catch {
      return [];
    }
  }

  async function writeManifest(
    base: FileSystemDirectoryHandle,
    entries: RoomPrivateEntry[]
  ): Promise<void> {
    const fh = await base.getFileHandle(GO_ROOM_PRIVATE_MANIFEST, {
      create: true,
    });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(entries));
    await w.close();
  }

  return {
    supported,
    async list() {
      if (!supported) return [];
      try {
        return await readManifest(await root());
      } catch {
        return [];
      }
    },
    async importFile(file) {
      if (!supported) {
        return { ok: false, error: GO_ROOM_PRIVATE_UNSUPPORTED_OPFS };
      }
      try {
        const base = await root();
        const dir = await filesDir(base);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeRoomPrivateName(file.name),
          mime: file.type || "application/octet-stream",
          size: file.size,
          createdAt: now(),
        };
        const fh = await dir.getFileHandle(id, { create: true });
        const w = await fh.createWritable();
        if (typeof file.stream === "function") {
          const reader = file.stream().getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) await w.write(value);
          }
        } else {
          await w.write(file);
        }
        await w.close();
        const entries = await readManifest(base);
        entries.push(entry);
        await writeManifest(base, entries);
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
      if (!supported) {
        return { ok: false, error: GO_ROOM_PRIVATE_UNSUPPORTED_OPFS };
      }
      try {
        const base = await root();
        const dir = await filesDir(base);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeRoomPrivateName(opts.name),
          mime: opts.mime || "application/octet-stream",
          size: 0,
          createdAt: now(),
        };
        const fh = await dir.getFileHandle(id, { create: true });
        const w = await fh.createWritable();
        let size = 0;
        let closed = false;
        const writer: RoomPrivateStreamWriter = {
          id,
          async writeChunk(chunk) {
            if (closed) return;
            await w.write(chunk);
            size += chunk.size;
          },
          async finalize() {
            if (closed) {
              return { ok: false, error: "錄影已結束" };
            }
            closed = true;
            await w.close();
            const done: RoomPrivateEntry = { ...entry, size };
            const entries = await readManifest(base);
            entries.push(done);
            await writeManifest(base, entries);
            return { ok: true, entry: done };
          },
          async abort() {
            if (closed) return;
            closed = true;
            try {
              await w.abort();
            } catch {
              /* ignore */
            }
            try {
              await dir.removeEntry(id);
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
      if (!supported || !isRoomPrivateFileId(id)) return null;
      try {
        const base = await root();
        const entries = await readManifest(base);
        const meta = entries.find((e) => e.id === id);
        if (!meta) return null;
        const dir = await filesDir(base);
        const fh = await dir.getFileHandle(id);
        const blob = await fh.getFile();
        return new File([blob], meta.name, {
          type: meta.mime || blob.type || "application/octet-stream",
          lastModified: meta.createdAt,
        });
      } catch {
        return null;
      }
    },
    async remove(id) {
      if (!supported || !isRoomPrivateFileId(id)) return;
      try {
        const base = await root();
        const entries = (await readManifest(base)).filter((e) => e.id !== id);
        await writeManifest(base, entries);
        try {
          const dir = await filesDir(base);
          await dir.removeEntry(id);
        } catch {
          /* missing blob ok */
        }
      } catch {
        /* ignore */
      }
    },
    async clear() {
      if (!supported) return;
      try {
        const base = await root();
        const entries = await readManifest(base);
        const dir = await filesDir(base);
        for (const e of entries) {
          try {
            await dir.removeEntry(e.id);
          } catch {
            /* ignore */
          }
        }
        await writeManifest(base, []);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Embedded browser Hub — OPFS backend. */
export function createRoomPrivateLibrary(
  deps: RoomPrivateOpfsDeps = {}
): RoomPrivateLibrary {
  return createRoomPrivateOpfsLibrary(deps);
}

function randomHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
