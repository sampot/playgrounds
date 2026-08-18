/**
 * Session-scoped peer file transfer over Roster DataChannel.
 * Control messages are JSON (`type: "session_file"`); chunks are binary frames.
 * Shared by play + go — go ⊂ play contract.
 */

export const SESSION_FILE_TYPE = "session_file" as const;
export const SESSION_FILE_VERSION = 1 as const;
/** Phase 1 cap (bytes). */
export const SESSION_FILE_MAX_BYTES = 32 * 1024 * 1024;
export const SESSION_FILE_CHUNK_PAYLOAD_MAX = 16 * 1024;
const SESSION_FILE_ID_MAX = 64;
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
  | "offer"
  | "accept"
  | "reject"
  | "done"
  | "cancel";

export type SessionFileControl = {
  type: typeof SESSION_FILE_TYPE;
  v: typeof SESSION_FILE_VERSION;
  op: SessionFileOp;
  id: string;
  name?: string;
  size?: number;
  mime?: string;
  hash?: string;
};

export type SessionFileChunk = {
  id: string;
  seq: number;
  payload: Uint8Array;
};

export function isBlockedSessionFileName(name: string): boolean {
  const base = name.trim().split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return false;
  const ext = base.slice(dot + 1).toLowerCase();
  return BLOCKED_FILE_EXT.has(ext);
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
  if (
    m.op !== "offer" &&
    m.op !== "accept" &&
    m.op !== "reject" &&
    m.op !== "done" &&
    m.op !== "cancel"
  ) {
    return false;
  }
  if (m.name !== undefined && typeof m.name !== "string") return false;
  if (m.mime !== undefined && typeof m.mime !== "string") return false;
  if (m.hash !== undefined && typeof m.hash !== "string") return false;
  if (m.size !== undefined) {
    if (typeof m.size !== "number" || !Number.isFinite(m.size) || m.size < 0) {
      return false;
    }
  }
  return true;
}

export function normalizeSessionFileOffer(
  data: unknown
): SessionFileControl | null {
  if (!isSessionFileControl(data) || data.op !== "offer") return null;
  const name = data.name?.trim() || "";
  const size = data.size;
  if (!name || typeof size !== "number") return null;
  if (size <= 0 || size > SESSION_FILE_MAX_BYTES) return null;
  if (isBlockedSessionFileName(name)) return null;
  return {
    type: SESSION_FILE_TYPE,
    v: SESSION_FILE_VERSION,
    op: "offer",
    id: data.id,
    name,
    size,
    mime: data.mime?.trim() || undefined,
    hash: data.hash?.trim() || undefined,
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
  const idBytes = new TextEncoder().encode(chunk.id);
  if (!chunk.id || idBytes.length > SESSION_FILE_ID_MAX) {
    throw new Error("invalid session_file id");
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
  const id = new TextDecoder().decode(bytes.subarray(5, 5 + idLen));
  const seqOff = 5 + idLen;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seq = view.getUint32(seqOff);
  const payload = bytes.subarray(seqOff + 4);
  return { id, seq, payload: new Uint8Array(payload) };
}

export function assembleSessionFileChunks(
  chunks: readonly SessionFileChunk[]
): ArrayBuffer {
  const ordered = [...chunks].sort((a, b) => a.seq - b.seq);
  let total = 0;
  for (const c of ordered) total += c.payload.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of ordered) {
    out.set(c.payload, offset);
    offset += c.payload.byteLength;
  }
  return out.buffer;
}

export function splitSessionFilePayload(
  bytes: Uint8Array,
  payloadMax: number = SESSION_FILE_CHUNK_PAYLOAD_MAX
): Uint8Array[] {
  if (bytes.byteLength === 0) return [];
  const parts: Uint8Array[] = [];
  for (let i = 0; i < bytes.byteLength; i += payloadMax) {
    parts.push(bytes.subarray(i, i + payloadMax));
  }
  return parts;
}
