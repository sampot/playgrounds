/**
 * Session-scoped peer file transfer over Roster DataChannel.
 * Control messages are JSON (`type: "session_file"`); chunks are binary frames.
 * Shared by play + go — go ⊂ play contract.
 *
 * 包廂：share／request 目錄＋拉流（見 PG-GO-ROOM-PLAN §8.2）。
 */

export const SESSION_FILE_TYPE = "session_file" as const;
export const SESSION_FILE_VERSION = 1 as const;
export const SESSION_FILE_CATALOG_ID = "catalog" as const;
/** Phase 1 cap (bytes). Streamed in chunks — this is duration／abuse insurance, not RAM. */
export const SESSION_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const SESSION_FILE_CHUNK_PAYLOAD_MAX = 16 * 1024;
/** Soft cap on files hung in one directory (not a RAM budget). */
export const SESSION_FILE_DIR_MAX_FILES = 64;
const SESSION_FILE_ID_MAX = 64;
const SESSION_FILE_PATH_MAX = 512;
const CHUNK_MAGIC = new Uint8Array([0x50, 0x47, 0x53, 0x46]); // PGSF

const BLOCKED_FILE_EXT = new Set([
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "dll",
  "apk",
  "dmg",
  "pkg",
]);

export type SessionFileOp =
  | "share"
  | "unshare"
  | "catalog"
  | "request"
  | "reject"
  | "done"
  | "cancel"
  | "pause"
  | "resume";

export type SessionFileShareItem = {
  id: string;
  name: string;
  size: number;
  mime?: string;
  owner: string;
  ownerName?: string;
  kind?: "file" | "dir" | "device";
  device?: "camera" | "mic";
  path?: string;
  parentId?: string;
};

export type SessionFileControl = {
  type: typeof SESSION_FILE_TYPE;
  v: typeof SESSION_FILE_VERSION;
  op: SessionFileOp;
  id: string;
  name?: string;
  size?: number;
  mime?: string;
  hash?: string;
  owner?: string;
  ownerName?: string;
  transferId?: string;
  from?: string;
  /** Byte start for this transfer. Play Range／seek; omit or 0 = from the start. */
  offset?: number;
  /**
   * Byte count for this transfer (HTTP body／Range length).
   * Omit = pump to EOF from offset. Partial Range／WebKit media caps must set this.
   */
  length?: number;
  items?: SessionFileShareItem[];
  kind?: "file" | "dir" | "device";
  device?: "camera" | "mic";
  path?: string;
  parentId?: string;
};

export type SessionFileChunk = {
  transferId: string;
  seq: number;
  payload: Uint8Array;
};

const FILE_OPS = new Set<SessionFileOp>([
  "share",
  "unshare",
  "catalog",
  "request",
  "reject",
  "done",
  "cancel",
  "pause",
  "resume",
]);

export function isSessionFileBroadcastOp(op: SessionFileOp): boolean {
  return op === "share" || op === "unshare" || op === "catalog";
}

export function isBlockedSessionFileName(name: string): boolean {
  const base = name.trim().split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  return BLOCKED_FILE_EXT.has(ext);
}

function isShareItem(raw: unknown): raw is SessionFileShareItem {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== "string" || !m.id || m.id.length > SESSION_FILE_ID_MAX) {
    return false;
  }
  if (typeof m.name !== "string" || !m.name.trim()) return false;
  if (typeof m.owner !== "string" || !m.owner.trim()) return false;
  if (typeof m.size !== "number" || !Number.isFinite(m.size) || m.size < 0) {
    return false;
  }
  if (m.kind === "file" || m.kind === undefined) {
    if (m.size <= 0) return false;
  } else if (m.kind === "dir") {
    /* size 0 folder listing */
  } else if (m.kind === "device") {
    if (m.device !== "camera" && m.device !== "mic") return false;
  } else {
    return false;
  }
  if (m.mime !== undefined && typeof m.mime !== "string") return false;
  if (m.ownerName !== undefined && typeof m.ownerName !== "string") return false;
  if (m.path !== undefined) {
    if (typeof m.path !== "string" || m.path.length > SESSION_FILE_PATH_MAX) {
      return false;
    }
  }
  if (m.parentId !== undefined) {
    if (
      typeof m.parentId !== "string" ||
      !m.parentId ||
      m.parentId.length > SESSION_FILE_ID_MAX
    ) {
      return false;
    }
  }
  return true;
}

export function isSessionFileControl(
  data: unknown
): data is SessionFileControl {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_FILE_TYPE) return false;
  if (m.v !== SESSION_FILE_VERSION) return false;
  if (typeof m.id !== "string" || !m.id || m.id.length > SESSION_FILE_ID_MAX) {
    return false;
  }
  if (typeof m.op !== "string" || !FILE_OPS.has(m.op as SessionFileOp)) {
    return false;
  }
  if (m.name !== undefined && typeof m.name !== "string") return false;
  if (m.mime !== undefined && typeof m.mime !== "string") return false;
  if (m.hash !== undefined && typeof m.hash !== "string") return false;
  if (m.owner !== undefined && typeof m.owner !== "string") return false;
  if (m.ownerName !== undefined && typeof m.ownerName !== "string") return false;
  if (m.transferId !== undefined && typeof m.transferId !== "string") {
    return false;
  }
  if (m.from !== undefined && typeof m.from !== "string") return false;
  if (m.offset !== undefined) {
    if (
      typeof m.offset !== "number" ||
      !Number.isFinite(m.offset) ||
      !Number.isInteger(m.offset) ||
      m.offset < 0 ||
      m.offset > SESSION_FILE_MAX_BYTES
    ) {
      return false;
    }
  }
  if (m.length !== undefined) {
    if (
      typeof m.length !== "number" ||
      !Number.isFinite(m.length) ||
      !Number.isInteger(m.length) ||
      m.length <= 0 ||
      m.length > SESSION_FILE_MAX_BYTES
    ) {
      return false;
    }
  }
  if (m.size !== undefined) {
    if (typeof m.size !== "number" || !Number.isFinite(m.size) || m.size < 0) {
      return false;
    }
  }
  if (
    m.kind !== undefined &&
    m.kind !== "file" &&
    m.kind !== "dir" &&
    m.kind !== "device"
  ) {
    return false;
  }
  if (m.device !== undefined && m.device !== "camera" && m.device !== "mic") {
    return false;
  }
  if (m.path !== undefined) {
    if (typeof m.path !== "string" || m.path.length > SESSION_FILE_PATH_MAX) {
      return false;
    }
  }
  if (m.parentId !== undefined) {
    if (
      typeof m.parentId !== "string" ||
      !m.parentId ||
      m.parentId.length > SESSION_FILE_ID_MAX
    ) {
      return false;
    }
  }
  if (m.items !== undefined) {
    if (!Array.isArray(m.items) || !m.items.every(isShareItem)) return false;
  }
  return true;
}

export function normalizeSessionFileShare(
  data: unknown
): SessionFileControl | null {
  if (!isSessionFileControl(data) || data.op !== "share") return null;
  const name = data.name?.trim() || "";
  const size = data.size;
  const owner = data.owner?.trim() || "";
  if (!name || typeof size !== "number" || !owner) return null;
  const kind =
    data.kind === "dir" || data.kind === "device" ? data.kind : undefined;
  if (kind === "dir") {
    if (size < 0) return null;
  } else if (kind === "device") {
    if (data.device !== "camera" && data.device !== "mic") return null;
    if (size < 0) return null;
  } else if (size <= 0 || size > SESSION_FILE_MAX_BYTES) {
    return null;
  }
  if (kind !== "device" && isBlockedSessionFileName(name)) return null;
  const path = data.path?.trim() || undefined;
  const parentId = data.parentId?.trim() || undefined;
  return {
    type: SESSION_FILE_TYPE,
    v: SESSION_FILE_VERSION,
    op: "share",
    id: data.id,
    name,
    size,
    owner,
    mime: data.mime?.trim() || undefined,
    ownerName: data.ownerName?.trim() || undefined,
    kind,
    device: kind === "device" ? data.device : undefined,
    path,
    parentId,
  };
}

export function buildSessionFileControl(
  partial: Omit<SessionFileControl, "type" | "v">
): SessionFileControl {
  return {
    type: SESSION_FILE_TYPE,
    v: SESSION_FILE_VERSION,
    ...partial,
  };
}

export function sessionFileChunkCount(
  size: number,
  payloadMax: number = SESSION_FILE_CHUNK_PAYLOAD_MAX
): number {
  if (size <= 0) return 0;
  return Math.ceil(size / payloadMax);
}

export function encodeSessionFileChunk(chunk: SessionFileChunk): ArrayBuffer {
  const idBytes = new TextEncoder().encode(chunk.transferId);
  if (!chunk.transferId || idBytes.length > SESSION_FILE_ID_MAX) {
    throw new Error("invalid session_file transferId");
  }
  const payload = chunk.payload;
  const out = new Uint8Array(4 + 1 + idBytes.length + 4 + payload.byteLength);
  out.set(CHUNK_MAGIC, 0);
  out[4] = idBytes.length;
  out.set(idBytes, 5);
  const seqOff = 5 + idBytes.length;
  const view = new DataView(out.buffer);
  view.setUint32(seqOff, chunk.seq >>> 0);
  out.set(payload, seqOff + 4);
  return out.buffer;
}

export function decodeSessionFileChunk(
  data: ArrayBuffer | Uint8Array
): SessionFileChunk | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.byteLength < 9) return null;
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== CHUNK_MAGIC[i]) return null;
  }
  const idLen = bytes[4]!;
  if (idLen < 1 || idLen > SESSION_FILE_ID_MAX) return null;
  if (bytes.byteLength < 5 + idLen + 4) return null;
  const transferId = new TextDecoder().decode(bytes.subarray(5, 5 + idLen));
  const seqOff = 5 + idLen;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seq = view.getUint32(seqOff);
  const payload = bytes.subarray(seqOff + 4);
  return { transferId, seq, payload: new Uint8Array(payload) };
}
