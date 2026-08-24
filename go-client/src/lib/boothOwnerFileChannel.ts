import type { BoothOwnerChunk } from "@pg/roster/boothChannel";
import {
  BOOTH_OWNER_CHUNK_BYTES,
  bytesToBase64,
  encodeOwnerChunk,
  isRtcDataChannelQueueFullError,
  parseOwnerChunkMessage,
  readFileInChunks,
  waitForOwnerDcDrain,
  base64ToBytes,
  type BoothOwnerChunkWire,
} from "./boothOwnerFileWire";

export type OwnerFileAckPayload = {
  transferId?: string;
  id?: string;
};

type UploadSession = {
  kind: "upload";
  scope: "private" | "share";
  name: string;
  mime: string;
  size: number;
  id: string;
  chunks: Map<number, Uint8Array>;
  nextSeq: number;
};

type DownloadSession = {
  kind: "download";
  scope: "private" | "share";
  id: string;
  file: File;
  sending: boolean;
};

type TransferSession = UploadSession | DownloadSession;

export function createBoothOwnerFileHost(deps: {
  importPrivateFile: (
    file: File
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  importShareFile: (
    file: File
  ) => Promise<{ ok: true; id?: string } | { ok: false; error: string }>;
  exportPrivateFile: (id: string) => Promise<File | null>;
  exportShareFile: (id: string) => Promise<File | null>;
  newPrivateId: () => string;
  send: (text: string) => void;
  bufferedAmount?: () => number;
}) {
  const sessions = new Map<string, TransferSession>();

  async function sendChunk(frame: BoothOwnerChunk & { data?: string }): Promise<void> {
    const payload = encodeOwnerChunk(frame);
    for (let attempt = 0; attempt < 12; attempt++) {
      await waitForOwnerDcDrain(deps.bufferedAmount);
      try {
        deps.send(payload);
        return;
      } catch (error) {
        if (!isRtcDataChannelQueueFullError(error) || attempt === 11) {
          throw error;
        }
      }
    }
  }

  async function flushUpload(transferId: string): Promise<void> {
    const session = sessions.get(transferId);
    if (!session || session.kind !== "upload") return;
    const ordered: Uint8Array[] = [];
    for (let i = 0; i < session.nextSeq; i++) {
      const part = session.chunks.get(i);
      if (!part) throw new Error("transfer_incomplete");
      ordered.push(part);
    }
    const blob = new Blob(ordered, {
      type: session.mime || "application/octet-stream",
    });
    const file = new File([blob], session.name, {
      type: session.mime || "application/octet-stream",
    });
    const out =
      session.scope === "share"
        ? await deps.importShareFile(file)
        : await deps.importPrivateFile(file);
    sessions.delete(transferId);
    if (!out.ok) throw new Error(out.error);
  }

  async function pushDownload(transferId: string): Promise<void> {
    const session = sessions.get(transferId);
    if (!session || session.kind !== "download" || session.sending) return;
    session.sending = true;
    await readFileInChunks(
      session.file,
      BOOTH_OWNER_CHUNK_BYTES,
      async (bytes, seq, eof) => {
        sendChunk({
          type: "booth.owner.chunk",
          v: 1,
          transferId,
          seq,
          eof,
          data: bytes.length ? bytesToBase64(bytes) : undefined,
        });
      }
    );
    sessions.delete(transferId);
  }

  function beginUpload(
    scope: "private" | "share",
    input: { name: string; size: number; mime?: string }
  ): OwnerFileAckPayload {
    const transferId = crypto.randomUUID();
    const id = scope === "private" ? deps.newPrivateId() : "";
    sessions.set(transferId, {
      kind: "upload",
      scope,
      name: input.name,
      mime: input.mime ?? "application/octet-stream",
      size: input.size,
      id,
      chunks: new Map(),
      nextSeq: 0,
    });
    return scope === "private" ? { transferId, id } : { transferId };
  }

  async function prepareDownload(
    scope: "private" | "share",
    id: string
  ): Promise<OwnerFileAckPayload> {
    const file =
      scope === "private"
        ? await deps.exportPrivateFile(id)
        : await deps.exportShareFile(id);
    if (!file) {
      throw new Error(scope === "private" ? "private_not_found" : "share_not_found");
    }
    const transferId = crypto.randomUUID();
    sessions.set(transferId, {
      kind: "download",
      scope,
      id,
      file,
      sending: false,
    });
    return { transferId, id };
  }

  return {
    beginPrivateUpload(input: {
      name: string;
      size: number;
      mime?: string;
    }): OwnerFileAckPayload {
      return beginUpload("private", input);
    },
    beginShareUpload(input: {
      name: string;
      size: number;
      mime?: string;
    }): OwnerFileAckPayload {
      return beginUpload("share", input);
    },
    async preparePrivateDownload(id: string): Promise<OwnerFileAckPayload> {
      return prepareDownload("private", id);
    },
    async prepareShareDownload(id: string): Promise<OwnerFileAckPayload> {
      return prepareDownload("share", id);
    },
    streamDownload(transferId: string): Promise<void> {
      return pushDownload(transferId);
    },
    handleMessage(raw: string): void {
      const frame = parseOwnerChunkMessage(raw);
      if (!frame) return;
      const session = sessions.get(frame.transferId);
      if (!session || session.kind !== "upload") return;
      if (typeof frame.data === "string" && frame.data.length > 0) {
        session.chunks.set(frame.seq, base64ToBytes(frame.data));
      } else {
        session.chunks.set(frame.seq, new Uint8Array(0));
      }
      session.nextSeq = Math.max(session.nextSeq, frame.seq + 1);
      if (frame.eof) {
        void flushUpload(frame.transferId).catch(() => {
          sessions.delete(frame.transferId);
        });
      }
    },
    reset(): void {
      sessions.clear();
    },
  };
}

export function createBoothOwnerFileClient(deps: {
  send: (text: string) => void;
  bufferedAmount?: () => number;
}) {
  const inbound = new Map<
    string,
    {
      chunks: Map<number, Uint8Array>;
      resolve: (blob: Blob) => void;
      reject: (e: Error) => void;
    }
  >();
  const earlyChunks = new Map<string, BoothOwnerChunkWire[]>();

  async function sendChunk(frame: BoothOwnerChunk & { data?: string }): Promise<void> {
    const payload = encodeOwnerChunk(frame);
    for (let attempt = 0; attempt < 12; attempt++) {
      await waitForOwnerDcDrain(deps.bufferedAmount);
      try {
        deps.send(payload);
        return;
      } catch (error) {
        if (!isRtcDataChannelQueueFullError(error) || attempt === 11) {
          throw error;
        }
      }
    }
  }

  function ingest(frame: BoothOwnerChunkWire): void {
    const session = inbound.get(frame.transferId);
    if (!session) {
      const q = earlyChunks.get(frame.transferId) ?? [];
      q.push(frame);
      earlyChunks.set(frame.transferId, q);
      return;
    }
    applyFrame(session, frame);
  }

  function applyFrame(
    session: {
      chunks: Map<number, Uint8Array>;
      resolve: (blob: Blob) => void;
    },
    frame: BoothOwnerChunkWire
  ): void {
    if (typeof frame.data === "string" && frame.data.length > 0) {
      session.chunks.set(frame.seq, base64ToBytes(frame.data));
    } else if (frame.eof) {
      session.chunks.set(frame.seq, new Uint8Array(0));
    }
    if (frame.eof) {
      const ordered: Uint8Array[] = [];
      const maxSeq = Math.max(-1, ...session.chunks.keys());
      for (let i = 0; i <= maxSeq; i++) {
        ordered.push(session.chunks.get(i) ?? new Uint8Array(0));
      }
      session.resolve(new Blob(ordered));
    }
  }

  return {
    async upload(transferId: string, file: File): Promise<void> {
      await readFileInChunks(
        file,
        BOOTH_OWNER_CHUNK_BYTES,
        async (bytes, seq, eof) => {
          sendChunk({
            type: "booth.owner.chunk",
            v: 1,
            transferId,
            seq,
            eof,
            data: bytes.length ? bytesToBase64(bytes) : undefined,
          });
        }
      );
    },
    receive(transferId: string): Promise<Blob> {
      return new Promise((resolve, reject) => {
        const session = {
          chunks: new Map<number, Uint8Array>(),
          resolve,
          reject,
        };
        inbound.set(transferId, session);
        const queued = earlyChunks.get(transferId) ?? [];
        earlyChunks.delete(transferId);
        for (const frame of queued) applyFrame(session, frame);
      });
    },
    handleMessage(raw: string): void {
      const frame = parseOwnerChunkMessage(raw);
      if (!frame) return;
      ingest(frame);
    },
    reset(): void {
      inbound.clear();
      earlyChunks.clear();
    },
  };
}

export async function waitForOwnerAck(
  send: (frame: { type: string; id: string; payload?: unknown }) => void,
  waitAck: (id: string) => Promise<OwnerFileAckPayload | undefined>,
  frame: { type: string; payload?: unknown }
): Promise<OwnerFileAckPayload> {
  const id = crypto.randomUUID();
  send({ ...frame, id });
  const payload = await waitAck(id);
  if (!payload?.transferId) throw new Error("transfer_rejected");
  return payload;
}

export function downloadBlobAsFile(blob: Blob, name: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
