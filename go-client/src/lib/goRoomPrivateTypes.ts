/**
 * Host private media library — shared types & id namespace.
 * PG-GO-ROOM-PLAN §5.5.1／§8.3; desktop uses native FS (TAURI-PLAN §7.4).
 */

export const GO_ROOM_PRIVATE_ID_PREFIX = "pvt_";
export const GO_ROOM_PRIVATE_MANIFEST = "manifest.json";
export const GO_ROOM_PRIVATE_FILES_DIR = "files";
/** Embedded OPFS root segment under `navigator.storage.getDirectory()`. */
export const GO_ROOM_PRIVATE_OPFS_ROOT = "room-private";

export const GO_ROOM_PRIVATE_UNSUPPORTED =
  "這台環境沒有私有片庫。可改用分享區掛檔。";
export const GO_ROOM_PRIVATE_UNSUPPORTED_OPFS =
  "這台瀏覽器沒有私有片庫（需要 OPFS）。可改用分享區掛檔。";

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

export function sanitizeRoomPrivateName(name: string): string {
  const trimmed = name.trim().slice(0, NAME_MAX) || "file";
  return trimmed.replace(/[/\\]/g, "_");
}

export function parseRoomPrivateManifest(raw: unknown): RoomPrivateEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is RoomPrivateEntry =>
      Boolean(e) &&
      typeof e === "object" &&
      isRoomPrivateFileId(String((e as RoomPrivateEntry).id)) &&
      typeof (e as RoomPrivateEntry).name === "string" &&
      typeof (e as RoomPrivateEntry).size === "number"
  );
}

function randomHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
