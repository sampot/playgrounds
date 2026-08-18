/**
 * In-memory session_file transfer for 包廂 (Phase 1).
 * Control JSON + binary chunks; no OPFS／IndexedDB／cloud.
 */

import {
  SESSION_FILE_MAX_BYTES,
  assembleSessionFileChunks,
  buildSessionFileControl,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
  isBlockedSessionFileName,
  isSessionFileControl,
  normalizeSessionFileOffer,
  splitSessionFilePayload,
  type SessionFileChunk,
  type SessionFileControl,
} from "@pg/roster/rosterSessionFile";

export type RoomFileStatus =
  | "offering"
  | "pending"
  | "transferring"
  | "done"
  | "rejected"
  | "cancelled"
  | "error";

export type RoomFileEntry = {
  id: string;
  direction: "out" | "in";
  name: string;
  size: number;
  mime?: string;
  status: RoomFileStatus;
  error?: string;
  blobUrl?: string;
  received: number;
};

export type RoomFileState = {
  entries: RoomFileEntry[];
  pendingIncoming: RoomFileEntry | null;
};

export type RoomFileTransfer = {
  offerLocalFile(
    file: File
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  acceptIncoming(id: string): boolean;
  rejectIncoming(id: string): boolean;
  cancel(id: string): void;
  onControl(data: unknown): void;
  onBinary(buf: ArrayBuffer | Uint8Array): void;
  dispose(): void;
  getState(): RoomFileState;
  subscribe(listener: (s: RoomFileState) => void): () => void;
};

type Deps = {
  sendJson: (msg: SessionFileControl) => void;
  sendBinary: (buf: ArrayBuffer) => void;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  newId?: () => string;
};

function busyStatuses(status: RoomFileStatus): boolean {
  return (
    status === "offering" ||
    status === "pending" ||
    status === "transferring"
  );
}

export function createRoomFileTransfer(deps: Deps): RoomFileTransfer {
  const createObjectUrl =
    deps.createObjectUrl ??
    ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl =
    deps.revokeObjectUrl ??
    ((url: string) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    });
  const newId =
    deps.newId ??
    (() => `sf-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`);

  let entries: RoomFileEntry[] = [];
  const listeners = new Set<(s: RoomFileState) => void>();
  const outboundFiles = new Map<string, File>();
  const inboundChunks = new Map<string, SessionFileChunk[]>();

  function emit() {
    const pendingIncoming =
      entries.find((e) => e.direction === "in" && e.status === "pending") ??
      null;
    const snap: RoomFileState = {
      entries: entries.map((e) => ({ ...e })),
      pendingIncoming: pendingIncoming ? { ...pendingIncoming } : null,
    };
    for (const l of listeners) l(snap);
  }

  function patch(id: string, partial: Partial<RoomFileEntry>): void {
    entries = entries.map((e) => (e.id === id ? { ...e, ...partial } : e));
    emit();
  }

  function hasBusy(): boolean {
    return entries.some((e) => busyStatuses(e.status));
  }

  function sendSafe(msg: SessionFileControl): void {
    try {
      deps.sendJson(msg);
    } catch {
      /* channel may be closed */
    }
  }

  async function pumpOutbound(id: string, file: File): Promise<void> {
    patch(id, { status: "transferring" });
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const parts = splitSessionFilePayload(buf);
      for (let seq = 0; seq < parts.length; seq += 1) {
        deps.sendBinary(
          encodeSessionFileChunk({ id, seq, payload: parts[seq]! })
        );
      }
      sendSafe(buildSessionFileControl({ op: "done", id, name: file.name }));
      patch(id, { status: "done", received: file.size });
    } catch (e) {
      patch(id, {
        status: "error",
        error: e instanceof Error ? e.message : "傳送失敗",
      });
    }
  }

  async function offerLocalFile(file: File) {
    const name = file.name.trim() || "file";
    if (isBlockedSessionFileName(name)) {
      return { ok: false as const, error: "這個檔案類型不能傳送" };
    }
    if (!file.size || file.size > SESSION_FILE_MAX_BYTES) {
      return { ok: false as const, error: "檔案太大或是空的（上限 32 MB）" };
    }
    if (hasBusy()) {
      return { ok: false as const, error: "一次只能傳一個檔" };
    }
    const id = newId();
    const mime = file.type || undefined;
    outboundFiles.set(id, file);
    entries = [
      ...entries,
      {
        id,
        direction: "out",
        name,
        size: file.size,
        mime,
        status: "offering",
        received: 0,
      },
    ];
    emit();
    sendSafe(
      buildSessionFileControl({
        op: "offer",
        id,
        name,
        size: file.size,
        mime,
      })
    );
    return { ok: true as const, id };
  }

  function acceptIncoming(id: string): boolean {
    const entry = entries.find((e) => e.id === id && e.direction === "in");
    if (!entry || entry.status !== "pending") return false;
    inboundChunks.set(id, []);
    patch(id, { status: "transferring" });
    sendSafe(buildSessionFileControl({ op: "accept", id }));
    return true;
  }

  function rejectIncoming(id: string): boolean {
    const entry = entries.find((e) => e.id === id && e.direction === "in");
    if (!entry || entry.status !== "pending") return false;
    patch(id, { status: "rejected" });
    sendSafe(buildSessionFileControl({ op: "reject", id }));
    return true;
  }

  function cancel(id: string): void {
    const entry = entries.find((e) => e.id === id);
    if (!entry || !busyStatuses(entry.status)) return;
    outboundFiles.delete(id);
    inboundChunks.delete(id);
    patch(id, { status: "cancelled" });
    sendSafe(buildSessionFileControl({ op: "cancel", id }));
  }

  function finishInbound(id: string): void {
    const entry = entries.find((e) => e.id === id);
    const chunks = inboundChunks.get(id) ?? [];
    inboundChunks.delete(id);
    if (!entry) return;
    try {
      const assembled = assembleSessionFileChunks(chunks);
      if (assembled.byteLength !== entry.size) {
        patch(id, { status: "error", error: "檔案不完整" });
        return;
      }
      const blob = new Blob([new Uint8Array(assembled)], {
        type: entry.mime || "application/octet-stream",
      });
      const blobUrl = createObjectUrl(blob);
      patch(id, {
        status: "done",
        blobUrl,
        received: assembled.byteLength,
      });
    } catch (e) {
      patch(id, {
        status: "error",
        error: e instanceof Error ? e.message : "組裝失敗",
      });
    }
  }

  function onControl(data: unknown): void {
    if (!isSessionFileControl(data)) return;
    if (data.op === "offer") {
      const offer = normalizeSessionFileOffer(data);
      if (!offer || !offer.name || offer.size == null) {
        sendSafe(buildSessionFileControl({ op: "reject", id: data.id }));
        return;
      }
      if (hasBusy()) {
        sendSafe(buildSessionFileControl({ op: "reject", id: offer.id }));
        return;
      }
      entries = [
        ...entries,
        {
          id: offer.id,
          direction: "in",
          name: offer.name,
          size: offer.size,
          mime: offer.mime,
          status: "pending",
          received: 0,
        },
      ];
      emit();
      return;
    }
    if (data.op === "accept") {
      const file = outboundFiles.get(data.id);
      const entry = entries.find((e) => e.id === data.id && e.direction === "out");
      if (!file || !entry || entry.status !== "offering") return;
      void pumpOutbound(data.id, file);
      return;
    }
    if (data.op === "reject") {
      outboundFiles.delete(data.id);
      const entry = entries.find((e) => e.id === data.id);
      if (entry && busyStatuses(entry.status)) {
        patch(data.id, { status: "rejected" });
      }
      return;
    }
    if (data.op === "cancel") {
      outboundFiles.delete(data.id);
      inboundChunks.delete(data.id);
      const entry = entries.find((e) => e.id === data.id);
      if (entry && busyStatuses(entry.status)) {
        patch(data.id, { status: "cancelled" });
      }
      return;
    }
    if (data.op === "done") {
      const entry = entries.find((e) => e.id === data.id && e.direction === "in");
      if (entry && entry.status === "transferring") finishInbound(data.id);
    }
  }

  function onBinary(buf: ArrayBuffer | Uint8Array): void {
    const chunk = decodeSessionFileChunk(buf);
    if (!chunk) return;
    const entry = entries.find((e) => e.id === chunk.id && e.direction === "in");
    if (!entry || entry.status !== "transferring") return;
    const list = inboundChunks.get(chunk.id) ?? [];
    list.push(chunk);
    inboundChunks.set(chunk.id, list);
    const received = list.reduce((n, c) => n + c.payload.byteLength, 0);
    if (received > entry.size) {
      inboundChunks.delete(chunk.id);
      patch(chunk.id, { status: "error", error: "檔案超過宣告大小" });
      sendSafe(buildSessionFileControl({ op: "cancel", id: chunk.id }));
      return;
    }
    patch(chunk.id, { received });
  }

  function dispose(): void {
    for (const e of entries) {
      if (e.blobUrl) revokeObjectUrl(e.blobUrl);
    }
    entries = [];
    outboundFiles.clear();
    inboundChunks.clear();
    emit();
  }

  return {
    offerLocalFile,
    acceptIncoming,
    rejectIncoming,
    cancel,
    onControl,
    onBinary,
    dispose,
    getState: () => ({
      entries: entries.map((e) => ({ ...e })),
      pendingIncoming:
        entries.find((e) => e.direction === "in" && e.status === "pending") ??
        null,
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener({
        entries: entries.map((e) => ({ ...e })),
        pendingIncoming:
          entries.find((e) => e.direction === "in" && e.status === "pending") ??
          null,
      });
      return () => listeners.delete(listener);
    },
  };
}
