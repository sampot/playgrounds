/**
 * Host-only private media library (OPFS). Never registers into `/room-file`.
 * PG-GO-ROOM-PLAN §5.5.1／§8.3.
 */

export const GO_ROOM_PRIVATE_OPFS_ROOT = "room-private";
export const GO_ROOM_PRIVATE_ID_PREFIX = "pvt_";
export const GO_ROOM_PRIVATE_UNSUPPORTED =
  "這台瀏覽器沒有私有片庫（需要 OPFS）。可改用分享區掛檔。";

const MANIFEST = "manifest.json";
const FILES_DIR = "files";
const ID_MAX = 128;
const NAME_MAX = 200;

export type RoomPrivateEntry = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
};

export type RoomPrivateImportResult =
  | { ok: true; entry: RoomPrivateEntry }
  | { ok: false; error: string };

export type RoomPrivateStreamWriter = {
  id: string;
  writeChunk(chunk: Blob): Promise<void>;
  finalize(): Promise<RoomPrivateImportResult>;
  abort(): Promise<void>;
};

export type RoomPrivateOpenStreamResult =
  | { ok: true; writer: RoomPrivateStreamWriter }
  | { ok: false; error: string };

export type RoomPrivateLibrary = {
  readonly supported: boolean;
  list(): Promise<RoomPrivateEntry[]>;
  importFile(file: File): Promise<RoomPrivateImportResult>;
  openStreamWrite(opts: {
    name: string;
    mime: string;
  }): Promise<RoomPrivateOpenStreamResult>;
  getFile(id: string): Promise<File | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
};

export type RoomPrivateLibraryDeps = {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  isSupported?: () => boolean;
  newId?: () => string;
  /** Test hook — must never be called on the happy path. */
  registerShareLocal?: (id: string, file: File) => void;
  now?: () => number;
};

export function isRoomPrivateFileId(id: string): boolean {
  return (
    typeof id === "string" &&
    id.startsWith(GO_ROOM_PRIVATE_ID_PREFIX) &&
    id.length > GO_ROOM_PRIVATE_ID_PREFIX.length &&
    id.length <= ID_MAX
  );
}

export function newRoomPrivateFileId(rand = randomHex): string {
  return `${GO_ROOM_PRIVATE_ID_PREFIX}${rand()}`;
}

function randomHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isOpfsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.storage?.getDirectory)
  );
}

function sanitizeName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX) || "file";
  return trimmed.replace(/[/\\]/g, "_");
}

export function createRoomPrivateLibrary(
  deps: RoomPrivateLibraryDeps = {}
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
    return base.getDirectoryHandle(FILES_DIR, { create: true });
  }

  async function readManifest(
    base: FileSystemDirectoryHandle
  ): Promise<RoomPrivateEntry[]> {
    try {
      const fh = await base.getFileHandle(MANIFEST);
      const file = await fh.getFile();
      const raw = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (e): e is RoomPrivateEntry =>
          Boolean(e) &&
          typeof e === "object" &&
          isRoomPrivateFileId(String((e as RoomPrivateEntry).id)) &&
          typeof (e as RoomPrivateEntry).name === "string" &&
          typeof (e as RoomPrivateEntry).size === "number"
      );
    } catch {
      return [];
    }
  }

  async function writeManifest(
    base: FileSystemDirectoryHandle,
    entries: RoomPrivateEntry[]
  ): Promise<void> {
    const fh = await base.getFileHandle(MANIFEST, { create: true });
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
        return { ok: false, error: GO_ROOM_PRIVATE_UNSUPPORTED };
      }
      try {
        const base = await root();
        const dir = await filesDir(base);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeName(file.name),
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
        return { ok: false, error: GO_ROOM_PRIVATE_UNSUPPORTED };
      }
      try {
        const base = await root();
        const dir = await filesDir(base);
        const id = newRoomPrivateFileId(newId);
        const entry: RoomPrivateEntry = {
          id,
          name: sanitizeName(opts.name),
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
