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
import { GO_ROOM_HANG_FILES_ONLY } from "./goRoom";
import {
  createImagePreviewSink,
  createRoomPlaySink,
  type RoomPlaySink,
} from "./goRoomFilePlay";
import { fileShareKind } from "./goRoomFileShare";

export type { RoomFileWritable };
export { SESSION_FILE_PLAY_BUFFER_MAX } from "./goRoomFilePlay";

export type RoomFilePickSave = (opts: {
  suggestedName: string;
}) => Promise<RoomFileWritable | null>;

export type RoomFilePlayback = {
  id: string;
  url: string;
  name: string;
  mime: string;
  kind: "audio" | "video" | "image";
};

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
  kind?: "file" | "dir" | "device";
  device?: "camera" | "mic";
  path?: string;
  parentId?: string;
};

export type RoomFileState = {
  entries: RoomFileEntry[];
  busy: boolean;
  playback: RoomFilePlayback | null;
};

export type RoomFileResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; cancelled?: boolean };

export type RoomFileTransfer = {
  shareLocalFile(file: File): Promise<RoomFileResult>;
  shareLocalDirectory(files: File[]): Promise<RoomFileResult>;
  unshareLocal(id: string): boolean;
  unshare(id: string, opts?: { host?: boolean }): boolean;
  download(id: string, pickSave: RoomFilePickSave): Promise<RoomFileResult>;
  play(id: string): Promise<RoomFileResult>;
  stopPlay(): void;
  notePlayhead(seconds: number): void;
  localFile(id: string): File | null;
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
  sendBinary: (buf: ArrayBuffer, destPeerId?: string) => void;
  bufferedAmount?: (destPeerId?: string) => number;
  newId?: () => string;
  createPlaySink?: (opts: { mime?: string; name?: string }) => RoomPlaySink;
};

const BUFFER_HIGH = 64 * 1024;

type Inbound = {
  fileId: string;
  transferId: string;
  received: number;
  size: number;
  writes: Promise<void>;
  purpose: "save" | "play";
  writable?: RoomFileWritable;
  mime?: string;
  name?: string;
  playPaused?: boolean;
};

function playbackKindOf(
  mime?: string,
  name?: string
): "audio" | "video" | "image" {
  const kind = fileShareKind({ mime, name });
  if (kind === "image") return "image";
  if (kind === "audio") return "audio";
  return "video";
}

async function writeLocalSlices(
  file: File,
  writable: RoomFileWritable
): Promise<void> {
  const chunk = SESSION_FILE_CHUNK_PAYLOAD_MAX;
  let offset = 0;
  while (offset < file.size) {
    const piece = file.slice(offset, offset + chunk);
    const buf = new Uint8Array(await piece.arrayBuffer());
    await writable.write(buf);
    offset += buf.byteLength;
  }
  await writable.close();
}

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
  let pumpPaused = false;
  let playback: RoomFilePlayback | null = null;
  let playSink: RoomPlaySink | null = null;
  const makePlaySink =
    deps.createPlaySink ??
    ((opts: { mime?: string; name?: string }) => createRoomPlaySink(opts));

  function busy(): boolean {
    return inbound != null || outboundTransferId != null;
  }

  function snap(): RoomFileState {
    return {
      entries: entries.map((e) => ({ ...e })),
      busy: busy(),
      playback,
    };
  }

  function revokePlayback(): void {
    playSink?.destroy();
    playSink = null;
    if (playback?.url) {
      try {
        URL.revokeObjectURL(playback.url);
      } catch {
        /* ignore */
      }
    }
    playback = null;
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

  function applyPlayPressure(pressure: "ok" | "high" | "low"): void {
    if (!inbound || inbound.purpose !== "play") return;
    if (pressure === "high" && !inbound.playPaused) {
      inbound.playPaused = true;
      sendSafe(
        buildSessionFileControl({
          op: "pause",
          id: inbound.fileId,
          transferId: inbound.transferId,
        })
      );
    } else if (pressure === "low" && inbound.playPaused) {
      inbound.playPaused = false;
      sendSafe(
        buildSessionFileControl({
          op: "resume",
          id: inbound.fileId,
          transferId: inbound.transferId,
        })
      );
    }
  }

  async function waitDrain(destPeerId?: string): Promise<void> {
    const get = deps.bufferedAmount ?? (() => 0);
    while (get(destPeerId) > BUFFER_HIGH) {
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  async function pumpOutbound(
    fileId: string,
    file: File,
    transferId: string,
    destPeerId?: string
  ): Promise<void> {
    outboundTransferId = transferId;
    pumpAbort = false;
    pumpPaused = false;
    patch(fileId, { status: "transferring", received: 0, error: undefined });
    try {
      let offset = 0;
      let seq = 0;
      while (offset < file.size) {
        if (pumpAbort) return;
        while (pumpPaused && !pumpAbort) {
          await new Promise((r) => setTimeout(r, 16));
        }
        if (pumpAbort) return;
        await waitDrain(destPeerId);
        if (pumpAbort) return;
        const end = Math.min(offset + SESSION_FILE_CHUNK_PAYLOAD_MAX, file.size);
        const slice = file.slice(offset, end);
        const buf = new Uint8Array(await slice.arrayBuffer());
        deps.sendBinary(
          encodeSessionFileChunk({
            transferId,
            seq,
            payload: buf,
          }),
          destPeerId
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
      return { ok: false, error: "檔案太大或是空的（上限 2 GB）" };
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

  async function shareLocalDirectory(_files: File[]): Promise<RoomFileResult> {
    return { ok: false, error: GO_ROOM_HANG_FILES_ONLY };
  }

  function localFile(id: string): File | null {
    return outboundFiles.get(id) ?? null;
  }

  function unshareLocal(id: string): boolean {
    const entry = entries.find((e) => e.id === id && e.mine);
    if (!entry) return false;
    const drop = new Set<string>([id]);
    if (entry.kind === "dir") {
      for (const e of entries) {
        if (e.parentId === id) drop.add(e.id);
      }
    }
    for (const gone of drop) outboundFiles.delete(gone);
    if (outboundTransferId) pumpAbort = true;
    if (playback && drop.has(playback.id)) revokePlayback();
    entries = entries.filter((e) => !drop.has(e.id));
    emit();
    sendSafe(buildSessionFileControl({ op: "unshare", id }));
    return true;
  }

  function unshare(id: string, opts?: { host?: boolean }): boolean {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;
    if (entry.mine) return unshareLocal(id);
    if (!opts?.host) return false;
    if (inbound && inbound.fileId === id) {
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: inbound.fileId,
          transferId: inbound.transferId,
        })
      );
      void closeInbound(false, "已撤回");
    }
    if (playback?.id === id) revokePlayback();
    entries = entries.filter((e) => e.id !== id && e.parentId !== id);
    emit();
    sendSafe(buildSessionFileControl({ op: "unshare", id }));
    return true;
  }

  async function download(
    id: string,
    pickSave: RoomFilePickSave
  ): Promise<RoomFileResult> {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return { ok: false, error: "找不到這個檔" };
    }
    if (entry.kind === "dir" || entry.kind === "device") {
      return { ok: false, error: GO_ROOM_HANG_FILES_ONLY };
    }
    if (entry.mine) {
      const file = outboundFiles.get(id);
      if (!file) return { ok: false, error: "找不到這個檔" };
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
      try {
        await writeLocalSlices(file, writable);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "下載失敗";
        return { ok: false, error: msg };
      }
      return { ok: true, id };
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
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose: "save",
      writable,
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

  async function play(id: string): Promise<RoomFileResult> {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return { ok: false, error: "找不到這個檔" };
    }
    if (entry.kind === "dir" || entry.kind === "device") {
      return { ok: false, error: GO_ROOM_HANG_FILES_ONLY };
    }
    if (entry.mine) {
      const file = outboundFiles.get(id);
      if (!file) return { ok: false, error: "找不到這個檔" };
      revokePlayback();
      playback = {
        id,
        url: URL.createObjectURL(file),
        name: entry.name,
        mime: entry.mime || file.type || "application/octet-stream",
        kind: playbackKindOf(entry.mime || file.type, entry.name),
      };
      emit();
      return { ok: true, id };
    }
    if (busy()) {
      return { ok: false, error: "一次只能傳一個檔" };
    }
    revokePlayback();
    const playKind = playbackKindOf(entry.mime, entry.name);
    playSink =
      playKind === "image"
        ? createImagePreviewSink({ mime: entry.mime, name: entry.name })
        : makePlaySink({ mime: entry.mime, name: entry.name });
    playback = {
      id,
      url: playSink.url,
      name: entry.name,
      mime: entry.mime || "application/octet-stream",
      kind: playbackKindOf(entry.mime, entry.name),
    };
    const transferId = newId();
    inbound = {
      fileId: id,
      transferId,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose: "play",
      mime: entry.mime,
      name: entry.name,
      playPaused: false,
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
    emit();
    return { ok: true, id };
  }

  function stopPlay(): void {
    if (inbound?.purpose === "play") {
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: inbound.fileId,
          transferId: inbound.transferId,
        })
      );
      void closeInbound(false, "已停止播放");
    }
    revokePlayback();
    emit();
  }

  function notePlayhead(seconds: number): void {
    if (!playSink || inbound?.purpose !== "play") return;
    void playSink.evictUntil(seconds).then(applyPlayPressure);
  }

  function catalogItems(): SessionFileShareItem[] {
    return entries
      .filter((e) => e.kind !== "dir" && e.kind !== "device")
      .map((e) => ({
      id: e.id,
      name: e.name,
      size: e.size,
      mime: e.mime,
      owner: e.ownerId,
      ownerName: e.ownerName,
      kind: e.kind,
      device: e.device,
      path: e.path,
      parentId: e.parentId,
    }));
  }

  function forgetOwner(ownerId: string): string[] {
    const gone = entries.filter((e) => e.ownerId === ownerId);
    if (gone.length === 0) return [];
    const ids = gone.map((e) => e.id);
    if (inbound && ids.includes(inbound.fileId)) {
      void inbound.writable?.abort?.();
      inbound = null;
    }
    if (playback && ids.includes(playback.id)) revokePlayback();
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
      if (cur.purpose === "save" && cur.writable) {
        if (ok) await cur.writable.close();
        else await cur.writable.abort?.();
      }
    } catch {
      /* ignore close errors */
    }
    if (ok && cur.purpose === "play") {
      playSink?.end();
      if (playback && playSink && playback.id === cur.fileId) {
        playback = { ...playback, url: playSink.url };
      }
    }
    if (ok) {
      patch(cur.fileId, {
        status: "listed",
        received: cur.size,
        error: undefined,
      });
    } else {
      if (cur.purpose === "play") revokePlayback();
      patch(cur.fileId, {
        status: "error",
        error: error || (cur.purpose === "play" ? "播放失敗" : "下載失敗"),
      });
    }
  }

  function onControl(data: unknown): void {
    if (!isSessionFileControl(data)) return;
    if (data.op === "share") {
      const share = normalizeSessionFileShare(data);
      if (!share || !share.name || typeof share.size !== "number" || !share.owner) {
        return;
      }
      if (share.owner === deps.localAgentId) return;
      if (share.kind === "dir" || share.kind === "device") return;
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
          kind: share.kind,
          device: share.device,
          path: share.path,
          parentId: share.parentId,
        },
      ];
      emit();
      return;
    }
    if (data.op === "unshare") {
      for (const e of entries) {
        if (e.mine && (e.id === data.id || e.parentId === data.id)) {
          outboundFiles.delete(e.id);
        }
      }
      outboundFiles.delete(data.id);
      if (outboundTransferId) pumpAbort = true;
      if (playback?.id === data.id) revokePlayback();
      const inboundHit =
        inbound &&
        (inbound.fileId === data.id ||
          entries.some(
            (e) => e.id === inbound?.fileId && e.parentId === data.id
          ));
      if (inbound && inboundHit) {
        sendSafe(
          buildSessionFileControl({
            op: "cancel",
            id: inbound.fileId,
            transferId: inbound.transferId,
          })
        );
        void closeInbound(false, "對方已撤回");
      }
      entries = entries.filter(
        (e) => e.id !== data.id && e.parentId !== data.id
      );
      emit();
      return;
    }
    if (data.op === "catalog") {
      const items = data.items ?? [];
      const mine = entries.filter((e) => e.mine);
      const remote: RoomFileEntry[] = [];
      for (const item of items) {
        if (item.owner === deps.localAgentId) continue;
        if (item.kind === "dir" || item.kind === "device") continue;
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
          kind: item.kind,
          device: item.device,
          path: item.path,
          parentId: item.parentId,
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
      void pumpOutbound(data.id, file, transferId, data.from);
      return;
    }
    if (data.op === "pause") {
      if (data.transferId && outboundTransferId === data.transferId) {
        pumpPaused = true;
      }
      return;
    }
    if (data.op === "resume") {
      if (data.transferId && outboundTransferId === data.transferId) {
        pumpPaused = false;
      }
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
      if (inbound?.purpose === "play") {
        if (!playSink) return;
        const pressure = await playSink.append(payload);
        applyPlayPressure(pressure);
        return;
      }
      await inbound?.writable?.write(payload);
    });
    patch(inbound.fileId, { received: next });
  }

  function dispose(): void {
    pumpAbort = true;
    if (inbound) void inbound.writable?.abort?.();
    inbound = null;
    outboundFiles.clear();
    entries = [];
    outboundTransferId = null;
    revokePlayback();
    emit();
  }

  return {
    shareLocalFile,
    shareLocalDirectory,
    unshareLocal,
    unshare,
    download,
    play,
    stopPlay,
    notePlayhead,
    localFile,
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
