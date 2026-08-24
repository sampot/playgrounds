import {
  BOOTH_CHANNEL_VERSION,
  isBoothOwnerChunk,
  type BoothOwnerChunk,
} from "@pg/roster/boothChannel";

export const BOOTH_OWNER_DC_LABEL = "booth.owner";
export const BOOTH_OWNER_CHUNK_BYTES = 48 * 1024;
/** Align with room file DC backpressure (goRoomFileTransfer). */
export const BOOTH_OWNER_BUFFER_HIGH = 64 * 1024;

export function isRtcDataChannelQueueFullError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /send queue is full|Queue is full/i.test(msg);
}

export async function waitForOwnerDcDrain(
  bufferedAmount?: () => number,
  high = BOOTH_OWNER_BUFFER_HIGH
): Promise<void> {
  const get = bufferedAmount ?? (() => 0);
  while (get() > high) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

export type BoothOwnerChunkWire = BoothOwnerChunk & {
  data?: string;
};

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function encodeOwnerChunk(frame: BoothOwnerChunkWire): string {
  return JSON.stringify({
    type: "booth.owner.chunk",
    v: BOOTH_CHANNEL_VERSION,
    transferId: frame.transferId,
    seq: frame.seq,
    eof: frame.eof === true ? true : undefined,
    data: frame.data,
  });
}

export function parseOwnerChunkMessage(
  raw: string | ArrayBuffer | Blob
): BoothOwnerChunkWire | null {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!isBoothOwnerChunk(parsed)) return null;
      return parsed as BoothOwnerChunkWire;
    } catch {
      return null;
    }
  }
  if (raw instanceof ArrayBuffer) {
    return parseOwnerChunkMessage(new TextDecoder().decode(raw));
  }
  return null;
}

export async function readFileInChunks(
  file: Blob,
  chunkSize: number,
  onChunk: (bytes: Uint8Array, seq: number, eof: boolean) => void | Promise<void>
): Promise<void> {
  const reader = file.stream().getReader();
  let seq = 0;
  let pending = new Uint8Array(0);
  for (;;) {
    const { done, value } = await reader.read();
    if (value?.length) {
      const merged = new Uint8Array(pending.length + value.length);
      merged.set(pending, 0);
      merged.set(value, pending.length);
      pending = merged;
    }
    while (pending.length >= chunkSize) {
      const slice = pending.subarray(0, chunkSize);
      pending = pending.subarray(chunkSize);
      await onChunk(slice, seq++, false);
    }
    if (done) {
      if (pending.length > 0) {
        await onChunk(pending, seq++, true);
      } else if (seq === 0) {
        await onChunk(new Uint8Array(0), 0, true);
      } else {
        await onChunk(new Uint8Array(0), seq, true);
      }
      break;
    }
  }
}
