/**
 * 包廂檔案分享區：目錄 metadata ＋ 按需串流。
 * 分享者只留 File handle；下載先取得 writable 再 request；RAM 最多一個 chunk。
 */

import {
  SESSION_FILE_CHUNK_PAYLOAD_MAX,
  SESSION_FILE_MAX_BYTES,
  buildSessionFileControl,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
  isBlockedSessionFileName,
  isSessionFileControl,
  normalizeSessionFileShare,
  type SessionFileControl,
  type SessionFileShareItem,
} from "@pg/roster/rosterSessionFile";
import { ROOM_FILE_SAVE_UNSUPPORTED } from "./goRoomFileSave";
import type { RoomFileWritable } from "./goRoomFileSave";

export type { RoomFileWritable };

export type RoomFilePickSave = (opts: {
  suggestedName: string;
}) => Promise<RoomFileWritable | null>;

export type RoomFileStatus = "listed" | "transferring" | "error";

export type RoomFileEntry = {
  id: string;
  name: string;
  size: number;
  mime?: string;
  ownerId: string;
  ownerName: string;
  mine: boolean;
  status: RoomFileStatus;
  received: number;
  error?: string;
};

export type RoomFileState = {
  entries: RoomFileEntry[];
  busy: boolean;
};

export type RoomFileResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; cancelled?: boolean };

export type RoomFileTransfer = {
  shareLocalFile(file: File): Promise<RoomFileResult>;
  unshareLocal(id: string): boolean;
  download(id: string, pickSave: RoomFilePickSave): Promise<RoomFileResult>;
  catalogItems(): SessionFileShareItem[];
  forgetOwner(ownerId: string): string[];
  onControl(data: unknown): void;
  onBinary(buf: ArrayBuffer | Uint8Array): void;
  dispose(): void;
  getState(): RoomFileState;
  subscribe(listener: (s: RoomFileState) => void): () => void;
};

export type RoomFileTransferDeps = {
  localAgentId: string;
  localName: string;
  sendJson: (msg: SessionFileControl) => void;
  sendBinary: (buf: ArrayBuffer) => void;
  bufferedAmount?: () => number;
  newId?: () => string;
};

const BUFFER_HIGH = 64 * 1024;

type Inbound = {
  fileId: string;
  transferId: string;
  writable: RoomFileWritable;
  received: number;
  size: number;
  writes: Promise<void>;
};

export function createRoomFileTransfer(
  deps: RoomFileTransferDeps
): RoomFileTransfer {
  const newId =
    deps.newId ??
    (() => `sf-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`);

  let entries: RoomFileEntry[] = [];
  const listeners = new Set<(s: RoomFileState) => void>();
  const outboundFiles = new Map<string, File>();
  let inbound: Inbound | null = null;
  let outboundTransferId: string | null = null;
  let pumpAbort = false;

  function busy(): boolean {
    return inbound != null || outboundTransferId != null;
  }

  function snap(): RoomFileState {
    return {
      entries: entries.map((e) => ({ ...e })),
      busy: busy(),
    };
  }

  function emit() {
    const s = snap();
    for (const l of listeners) l(s);
  }

  function patch(id: string, partial: Partial<RoomFileEntry>): void {
    entries = entries.map((e) => (e.id === id ? { ...e, ...partial } : e));
    emit();
  }

  function sendSafe(msg: SessionFileControl): void {
    try {
      deps.sendJson(msg);
    } catch {
      /* channel may be closed */
    }
  }

  async function waitDrain(): Promise<void> {
    const get = deps.bufferedAmount ?? (() => 0);
    while (get() > BUFFER_HIGH) {
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  async function pumpOutbound(
    fileId: string,
    file: File,
    transferId: string
  ): Promise<void> {
    outboundTransferId = transferId;
    pumpAbort = false;
    patch(fileId, { status: "transferring", received: 0, error: undefined });
    try {
      let offset = 0;
      let seq = 0;
      while (offset < file.size) {
        if (pumpAbort) return;
        await waitDrain();
        if (pumpAbort) return;
        const end = Math.min(offset + SESSION_FILE_CHUNK_PAYLOAD_MAX, file.size);
        const slice = file.slice(offset, end);
        const buf = new Uint8Array(await slice.arrayBuffer());
        deps.sendBinary(
          encodeSessionFileChunk({
            transferId,
            seq,
            payload: buf,
          })
        );
        offset += buf.byteLength;
        seq += 1;
        patch(fileId, { received: offset });
      }
      if (pumpAbort) return;
      sendSafe(
        buildSessionFileControl({
          op: "done",
          id: fileId,
          transferId,
        })
      );
      patch(fileId, { status: "listed", received: file.size });
    } catch (e) {
      patch(fileId, {
        status: "error",
        error: e instanceof Error ? e.message : "傳送失敗",
      });
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: fileId,
          transferId,
        })
      );
    } finally {
      outboundTransferId = null;
      emit();
    }
  }

  async function shareLocalFile(file: File): Promise<RoomFileResult> {
    const name = file.name.trim() || "file";
    if (isBlockedSessionFileName(name)) {
      return { ok: false, error: "這個檔案類型不能分享" };
    }
    if (!file.size || file.size > SESSION_FILE_MAX_BYTES) {
      return { ok: false, error: "檔案太大或是空的（上限 32 MB）" };
    }
    const id = newId();
    const mime = file.type || undefined;
    outboundFiles.set(id, file);
    entries = [
      ...entries,
      {
        id,
        name,
        size: file.size,
        mime,
        ownerId: deps.localAgentId,
        ownerName: deps.localName,
        mine: true,
        status: "listed",
        received: 0,
      },
    ];
    emit();
    sendSafe(
      buildSessionFileControl({
        op: "share",
        id,
        name,
        size: file.size,
        mime,
        owner: deps.localAgentId,
        ownerName: deps.localName,
      })
    );
    return { ok: true, id };
  }

  function unshareLocal(id: string): boolean {
    const entry = entries.find((e) => e.id === id && e.mine);
    if (!entry) return false;
    outboundFiles.delete(id);
    if (outboundTransferId) pumpAbort = true;
    entries = entries.filter((e) => e.id !== id);
    emit();
    sendSafe(buildSessionFileControl({ op: "unshare", id }));
    return true;
  }

  async function download(
    id: string,
    pickSave: RoomFilePickSave
  ): Promise<RoomFileResult> {
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.mine) {
      return { ok: false, error: "找不到這個檔" };
    }
    if (busy()) {
      return { ok: false, error: "一次只能傳一個檔" };
    }
    let writable: RoomFileWritable | null;
    try {
      writable = await pickSave({ suggestedName: entry.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : ROOM_FILE_SAVE_UNSUPPORTED;
      return { ok: false, error: msg };
    }
    if (!writable) {
      return { ok: false, error: "已取消", cancelled: true };
    }
    const transferId = newId();
    inbound = {
      fileId: id,
      transferId,
      writable,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
    };
    patch(id, { status: "transferring", received: 0, error: undefined });
    sendSafe(
      buildSessionFileControl({
        op: "request",
        id,
        transferId,
        from: deps.localAgentId,
      })
    );
    return { ok: true, id };
  }

  function catalogItems(): SessionFileShareItem[] {
    return entries.map((e) => ({
      id: e.id,
      name: e.name,
      size: e.size,
      mime: e.mime,
      owner: e.ownerId,
      ownerName: e.ownerName,
    }));
  }

  function forgetOwner(ownerId: string): string[] {
    const gone = entries.filter((e) => e.ownerId === ownerId);
    if (gone.length === 0) return [];
    const ids = gone.map((e) => e.id);
    if (inbound && ids.includes(inbound.fileId)) {
      void inbound.writable.abort?.();
      inbound = null;
    }
    entries = entries.filter((e) => e.ownerId !== ownerId);
    emit();
    return ids;
  }

  async function closeInbound(ok: boolean, error?: string): Promise<void> {
    const cur = inbound;
    inbound = null;
    if (!cur) return;
    try {
      await cur.writes;
      if (ok) await cur.writable.close();
      else await cur.writable.abort?.();
    } catch {
      /* ignore close errors */
    }
    if (ok) {
      patch(cur.fileId, {
        status: "listed",
        received: cur.size,
        error: undefined,
      });
    } else {
      patch(cur.fileId, {
        status: "error",
        error: error || "下載失敗",
      });
    }
  }

  function onControl(data: unknown): void {
    if (!isSessionFileControl(data)) return;
    if (data.op === "share") {
      const share = normalizeSessionFileShare(data);
      if (!share || !share.name || share.size == null || !share.owner) return;
      if (share.owner === deps.localAgentId) return;
      if (entries.some((e) => e.id === share.id)) return;
      entries = [
        ...entries,
        {
          id: share.id,
          name: share.name,
          size: share.size,
          mime: share.mime,
          ownerId: share.owner,
          ownerName: share.ownerName?.trim() || share.owner,
          mine: false,
          status: "listed",
          received: 0,
        },
      ];
      emit();
      return;
    }
    if (data.op === "unshare") {
      if (inbound?.fileId === data.id) {
        sendSafe(
          buildSessionFileControl({
            op: "cancel",
            id: data.id,
            transferId: inbound.transferId,
          })
        );
        void closeInbound(false, "對方已撤回");
      }
      entries = entries.filter((e) => e.id !== data.id);
      emit();
      return;
    }
    if (data.op === "catalog") {
      const items = data.items ?? [];
      const mine = entries.filter((e) => e.mine);
      const remote: RoomFileEntry[] = [];
      for (const item of items) {
        if (item.owner === deps.localAgentId) continue;
        if (mine.some((m) => m.id === item.id)) continue;
        remote.push({
          id: item.id,
          name: item.name,
          size: item.size,
          mime: item.mime,
          ownerId: item.owner,
          ownerName: item.ownerName?.trim() || item.owner,
          mine: false,
          status: "listed",
          received: 0,
        });
      }
      entries = [...mine, ...remote];
      emit();
      return;
    }
    if (data.op === "request") {
      const file = outboundFiles.get(data.id);
      const transferId = data.transferId;
      if (!file || !transferId) {
        if (transferId) {
          sendSafe(
            buildSessionFileControl({
              op: "reject",
              id: data.id,
              transferId,
            })
          );
        }
        return;
      }
      if (busy() && outboundTransferId !== transferId) {
        sendSafe(
          buildSessionFileControl({
            op: "reject",
            id: data.id,
            transferId,
          })
        );
        return;
      }
      void pumpOutbound(data.id, file, transferId);
      return;
    }
    if (data.op === "reject" || data.op === "cancel") {
      if (data.transferId && inbound?.transferId === data.transferId) {
        void closeInbound(false, data.op === "reject" ? "現在傳不了" : "已取消");
      }
      if (data.transferId && outboundTransferId === data.transferId) {
        pumpAbort = true;
      }
      return;
    }
    if (data.op === "done") {
      if (data.transferId && inbound?.transferId === data.transferId) {
        const cur = inbound;
        void cur.writes.then(() => {
          if (inbound !== cur) return;
          if (cur.received !== cur.size) {
            void closeInbound(false, "檔案不完整");
            return;
          }
          void closeInbound(true);
        });
      }
    }
  }

  function onBinary(buf: ArrayBuffer | Uint8Array): void {
    const chunk = decodeSessionFileChunk(buf);
    if (!chunk || !inbound) return;
    if (chunk.transferId !== inbound.transferId) return;
    const next = inbound.received + chunk.payload.byteLength;
    if (next > inbound.size) {
      void closeInbound(false, "檔案超過宣告大小");
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: inbound.fileId,
          transferId: inbound.transferId,
        })
      );
      return;
    }
    const payload = chunk.payload;
    inbound.received = next;
    inbound.writes = inbound.writes.then(async () => {
      await inbound?.writable.write(payload);
    });
    patch(inbound.fileId, { received: next });
  }

  function dispose(): void {
    pumpAbort = true;
    if (inbound) void inbound.writable.abort?.();
    inbound = null;
    outboundFiles.clear();
    entries = [];
    outboundTransferId = null;
    emit();
  }

  return {
    shareLocalFile,
    unshareLocal,
    download,
    catalogItems,
    forgetOwner,
    onControl,
    onBinary,
    dispose,
    getState: snap,
    subscribe(listener) {
      listeners.add(listener);
      listener(snap());
      return () => listeners.delete(listener);
    },
  };
}
