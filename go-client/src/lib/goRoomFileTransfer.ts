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
import { waitRoomPlaySw } from "./goRoomPlayBridge";
import { fileShareKind } from "./goRoomFileShare";
import {
  SESSION_FILE_PLAY_MAX_INFLIGHT,
  SESSION_FILE_PLAY_RANGE_SLICE,
  SESSION_FILE_PLAY_SEEK_DEBOUNCE_MS,
  SESSION_FILE_PLAY_SEEK_SLACK,
} from "./goRoomPlayRegistry";

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
  seekPlay(offset: number): Promise<RoomFileResult>;
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
  createPlaySink?: (opts: {
    mime?: string;
    name?: string;
    size?: number;
    playId?: string;
  }) => RoomPlaySink;
};

const BUFFER_HIGH = 64 * 1024;

type Inbound = {
  fileId: string;
  transferId: string;
  received: number;
  size: number;
  writes: Promise<void>;
  purpose: "save" | "play";
  baseOffset: number;
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
  const inbounds = new Map<string, Inbound>();
  const outboundPumps = new Map<
    string,
    {
      transferId: string;
      fileId: string;
      destPeerId?: string;
      abort: boolean;
      paused: boolean;
    }
  >();
  let playback: RoomFilePlayback | null = null;
  let playSink: RoomPlaySink | null = null;
  let lastSeekOpenAt = -1;
  let lastSeekOpenTs = 0;
  const makePlaySink =
    deps.createPlaySink ??
    ((opts: { mime?: string; name?: string; size?: number; playId?: string }) =>
      createRoomPlaySink(opts));

  function playInbounds(): Inbound[] {
    return [...inbounds.values()].filter((i) => i.purpose === "play");
  }

  function hasSaveInbound(): boolean {
    for (const i of inbounds.values()) {
      if (i.purpose === "save") return true;
    }
    return false;
  }

  function busy(): boolean {
    return inbounds.size > 0 || outboundPumps.size > 0;
  }

  function pumpsForPeer(peer?: string) {
    const key = peer ?? "";
    return [...outboundPumps.values()].filter((p) => (p.destPeerId ?? "") === key);
  }

  function snap(): RoomFileState {
    if (playback && playSink) playback.url = playSink.url;
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

  function abortOutboundForFile(fileId: string): void {
    for (const p of outboundPumps.values()) {
      if (p.fileId === fileId) p.abort = true;
    }
  }

  function cancelInboundsForFile(fileId: string, reason: string): void {
    for (const cur of [...inbounds.values()]) {
      if (cur.fileId !== fileId) continue;
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: cur.fileId,
          transferId: cur.transferId,
        })
      );
      void closeInbound(cur, false, reason);
    }
  }

  function evictPlayInboundFor(at: number): Inbound | undefined {
    const plays = playInbounds();
    if (plays.length < SESSION_FILE_PLAY_MAX_INFLIGHT) return undefined;
    const pool = plays.filter(
      (p) => !(p.baseOffset === 0 && p.received < p.size - p.baseOffset)
    );
    const candidates = pool.length > 0 ? pool : plays;
    let worst = candidates[0];
    let worstScore = -1;
    for (const p of candidates) {
      const pumped = p.baseOffset + p.received;
      const dist =
        at < p.baseOffset ? p.baseOffset - at : at > pumped ? at - pumped : 0;
      const score = dist * 2 + p.baseOffset;
      if (score > worstScore) {
        worst = p;
        worstScore = score;
      }
    }
    return worst;
  }

  function dropPlayInbound(cur: Inbound): void {
    if (inbounds.get(cur.transferId) !== cur) return;
    inbounds.delete(cur.transferId);
    sendSafe(
      buildSessionFileControl({
        op: "cancel",
        id: cur.fileId,
        transferId: cur.transferId,
      })
    );
  }

  function applyPlayPressure(pressure: "ok" | "high" | "low"): void {
    for (const cur of playInbounds()) {
      if (pressure === "high" && !cur.playPaused) {
        if (cur.baseOffset > 0) continue;
        cur.playPaused = true;
        sendSafe(
          buildSessionFileControl({
            op: "pause",
            id: cur.fileId,
            transferId: cur.transferId,
          })
        );
      } else if (pressure === "low" && cur.playPaused) {
        cur.playPaused = false;
        sendSafe(
          buildSessionFileControl({
            op: "resume",
            id: cur.fileId,
            transferId: cur.transferId,
          })
        );
      }
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
    destPeerId?: string,
    startOffset = 0
  ): Promise<void> {
    const pump = {
      transferId,
      fileId,
      destPeerId,
      abort: false,
      paused: false,
    };
    outboundPumps.set(transferId, pump);
    const from = Math.max(0, Math.min(file.size, Math.floor(startOffset)));
    patch(fileId, { status: "transferring", received: from, error: undefined });
    try {
      let offset = from;
      let seq = 0;
      while (offset < file.size) {
        if (pump.abort) return;
        while (pump.paused && !pump.abort) {
          await new Promise((r) => setTimeout(r, 16));
        }
        if (pump.abort) return;
        await waitDrain(destPeerId);
        if (pump.abort) return;
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
        const listed = entries.find((e) => e.id === fileId);
        patch(fileId, {
          received: Math.max(listed?.received ?? 0, offset),
        });
      }
      if (pump.abort) return;
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
      outboundPumps.delete(transferId);
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
    abortOutboundForFile(id);
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
    cancelInboundsForFile(id, "已撤回");
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
    inbounds.set(transferId, {
      fileId: id,
      transferId,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose: "save",
      baseOffset: 0,
      writable,
    });
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
    const transferId = newId();
    if (playKind !== "image") await waitRoomPlaySw();
    playSink =
      playKind === "image"
        ? createImagePreviewSink({ mime: entry.mime, name: entry.name })
        : makePlaySink({
            mime: entry.mime,
            name: entry.name,
            size: entry.size,
            /** Stable per file so remount／re-play keeps the same `/room-play/<id>`. */
            playId: id,
          });
    playback = {
      id,
      url: playSink.url,
      name: entry.name,
      mime: entry.mime || "application/octet-stream",
      kind: playbackKindOf(entry.mime, entry.name),
    };
    inbounds.set(transferId, {
      fileId: id,
      transferId,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose: "play",
      baseOffset: 0,
      mime: entry.mime,
      name: entry.name,
      playPaused: false,
    });
    patch(id, { status: "transferring", received: 0, error: undefined });
    sendSafe(
      buildSessionFileControl({
        op: "request",
        id,
        transferId,
        from: deps.localAgentId,
        offset: 0,
      })
    );
    emit();
    return { ok: true, id };
  }

  async function seekPlay(offset: number): Promise<RoomFileResult> {
    const at = Math.floor(offset);
    if (!Number.isFinite(at) || at < 0) {
      return { ok: false, error: "無法跳到那裡" };
    }
    if (!playback || !playSink) {
      return { ok: false, error: "沒有在播放" };
    }
    const entry = entries.find((e) => e.id === playback.id);
    if (!entry || entry.mine) {
      return { ok: true, id: playback.id };
    }
    if (at >= entry.size) {
      return { ok: false, error: "無法跳到那裡" };
    }
    if (playSink.covers?.(at, Math.min(entry.size, at + 1))) {
      return { ok: true, id: playback.id };
    }
    const resumePlay = (cur: Inbound) => {
      if (!cur.playPaused) return;
      cur.playPaused = false;
      sendSafe(
        buildSessionFileControl({
          op: "resume",
          id: cur.fileId,
          transferId: cur.transferId,
        })
      );
    };
    /**
     * Active transfer that already owns this byte region: wait for it.
     * Slack must be >> SW need slice or every pull opens another DC Range.
     */
    for (const cur of playInbounds()) {
      if (cur.fileId !== playback.id) continue;
      const pumped = cur.baseOffset + cur.received;
      if (at >= cur.baseOffset && at <= pumped + SESSION_FILE_PLAY_SEEK_SLACK) {
        resumePlay(cur);
        return { ok: true, id: playback.id };
      }
    }
    const now = Date.now();
    if (
      lastSeekOpenAt >= 0 &&
      now - lastSeekOpenTs < SESSION_FILE_PLAY_SEEK_DEBOUNCE_MS &&
      Math.abs(at - lastSeekOpenAt) <= SESSION_FILE_PLAY_RANGE_SLICE
    ) {
      return { ok: true, id: playback.id };
    }
    if (hasSaveInbound()) {
      return { ok: false, error: "一次只能傳一個檔" };
    }
    /** Far seek: drop transfers that cannot serve this offset. */
    for (const cur of [...playInbounds()]) {
      if (cur.fileId !== playback.id) continue;
      const pumped = cur.baseOffset + cur.received;
      const near =
        at >= cur.baseOffset - SESSION_FILE_PLAY_SEEK_SLACK &&
        at <= pumped + SESSION_FILE_PLAY_SEEK_SLACK;
      if (!near) dropPlayInbound(cur);
    }
    const victim = evictPlayInboundFor(at);
    if (victim) dropPlayInbound(victim);
    const transferId = newId();
    lastSeekOpenAt = at;
    lastSeekOpenTs = now;
    inbounds.set(transferId, {
      fileId: playback.id,
      transferId,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose: "play",
      baseOffset: at,
      mime: entry.mime,
      name: entry.name,
      playPaused: false,
    });
    patch(playback.id, {
      status: "transferring",
      received: Math.max(entry.received, at, playReceivedAbs(playback.id)),
      error: undefined,
    });
    sendSafe(
      buildSessionFileControl({
        op: "request",
        id: playback.id,
        transferId,
        from: deps.localAgentId,
        offset: at,
      })
    );
    emit();
    return { ok: true, id: playback.id };
  }

  function stopPlay(): void {
    for (const cur of playInbounds()) {
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: cur.fileId,
          transferId: cur.transferId,
        })
      );
      void closeInbound(cur, false, "已停止播放");
    }
    revokePlayback();
    emit();
  }

  function notePlayhead(seconds: number): void {
    if (!playSink || playInbounds().length === 0) return;
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
    for (const cur of [...inbounds.values()]) {
      if (!ids.includes(cur.fileId)) continue;
      void cur.writable?.abort?.();
      inbounds.delete(cur.transferId);
    }
    if (playback && ids.includes(playback.id)) revokePlayback();
    entries = entries.filter((e) => e.ownerId !== ownerId);
    emit();
    return ids;
  }

  async function closeInbound(
    cur: Inbound,
    ok: boolean,
    error?: string
  ): Promise<void> {
    if (inbounds.get(cur.transferId) === cur) inbounds.delete(cur.transferId);
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
      const expect = Math.max(0, cur.size - cur.baseOffset);
      if (cur.received !== expect) {
        patch(cur.fileId, {
          status: "error",
          error: "檔案不完整",
        });
        return;
      }
      if (playInbounds().length === 0) {
        playSink?.end();
        if (playback && playSink && playback.id === cur.fileId) {
          playback = { ...playback, url: playSink.url };
        }
      }
    }
    if (ok) {
      if (cur.purpose !== "play" || playInbounds().length === 0) {
        patch(cur.fileId, {
          status: "listed",
          received: cur.size,
          error: undefined,
        });
      }
    } else {
      if (cur.purpose === "play" && playInbounds().length === 0) {
        revokePlayback();
      }
      if (cur.purpose !== "play" || playInbounds().length === 0) {
        patch(cur.fileId, {
          status: "error",
          error: error || (cur.purpose === "play" ? "播放失敗" : "下載失敗"),
        });
      }
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
      abortOutboundForFile(data.id);
      if (playback?.id === data.id) revokePlayback();
      cancelInboundsForFile(data.id, "對方已撤回");
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
      const peerPumps = pumpsForPeer(data.from);
      if (peerPumps.length >= SESSION_FILE_PLAY_MAX_INFLIGHT) {
        peerPumps[0]!.abort = true;
      }
      void pumpOutbound(data.id, file, transferId, data.from, data.offset ?? 0);
      return;
    }
    if (data.op === "pause") {
      const pump = data.transferId ? outboundPumps.get(data.transferId) : undefined;
      if (pump) pump.paused = true;
      return;
    }
    if (data.op === "resume") {
      const pump = data.transferId ? outboundPumps.get(data.transferId) : undefined;
      if (pump) pump.paused = false;
      return;
    }
    if (data.op === "reject" || data.op === "cancel") {
      const inboundHit = data.transferId ? inbounds.get(data.transferId) : undefined;
      if (inboundHit) {
        void closeInbound(
          inboundHit,
          false,
          data.op === "reject" ? "現在傳不了" : "已取消"
        );
      }
      const pump = data.transferId ? outboundPumps.get(data.transferId) : undefined;
      if (pump) pump.abort = true;
      return;
    }
    if (data.op === "done") {
      const cur = data.transferId ? inbounds.get(data.transferId) : undefined;
      if (cur) {
        void cur.writes.then(() => {
          if (inbounds.get(cur.transferId) !== cur) return;
          if (cur.received !== cur.size - cur.baseOffset) {
            void closeInbound(cur, false, "檔案不完整");
            return;
          }
          void closeInbound(cur, true);
        });
      }
    }
  }

  function playReceivedAbs(fileId: string): number {
    let max = 0;
    for (const cur of playInbounds()) {
      if (cur.fileId !== fileId) continue;
      max = Math.max(max, cur.baseOffset + cur.received);
    }
    const listed = entries.find((e) => e.id === fileId);
    if (listed) max = Math.max(max, listed.received);
    return max;
  }

  function onBinary(buf: ArrayBuffer | Uint8Array): void {
    const chunk = decodeSessionFileChunk(buf);
    if (!chunk) return;
    const cur = inbounds.get(chunk.transferId);
    if (!cur) return;
    const at = cur.baseOffset + cur.received;
    const nextGot = cur.received + chunk.payload.byteLength;
    if (at + chunk.payload.byteLength > cur.size) {
      void closeInbound(cur, false, "檔案超過宣告大小");
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: cur.fileId,
          transferId: cur.transferId,
        })
      );
      return;
    }
    const payload = chunk.payload;
    cur.writes = cur.writes.then(async () => {
      if (inbounds.get(cur.transferId) !== cur) return;
      if (cur.purpose === "play") {
        if (!playSink) return;
        const end = Math.min(cur.size, at + payload.byteLength);
        const pressure = await playSink.append(payload, at);
        const accepted = playSink.covers?.(at, end) ?? true;
        if (accepted) {
          cur.received = nextGot;
          patch(cur.fileId, { received: playReceivedAbs(cur.fileId) });
          applyPlayPressure(pressure);
        } else {
          if (!cur.playPaused) {
            cur.playPaused = true;
            sendSafe(
              buildSessionFileControl({
                op: "pause",
                id: cur.fileId,
                transferId: cur.transferId,
              })
            );
          }
        }
        return;
      }
      cur.received = nextGot;
      await cur.writable?.write(payload);
      patch(cur.fileId, { received: at + payload.byteLength });
    });
  }

  function dispose(): void {
    for (const p of outboundPumps.values()) p.abort = true;
    for (const cur of inbounds.values()) void cur.writable?.abort?.();
    inbounds.clear();
    outboundFiles.clear();
    entries = [];
    outboundPumps.clear();
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
    seekPlay,
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
