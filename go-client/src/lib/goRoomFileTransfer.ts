/**
 * 包廂檔案分享區：目錄 metadata ＋ 按需串流。
 * 前端一律 `/room-file/<id>`；本機 File 由 SW／page registry 直出（不經 DC）；
 * 遠端 bytes 經 DC transfer；下載＝fetch → writable。
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
import {
  ROOM_FILE_SAVE_UNSUPPORTED,
  pipeResponseToWritable,
} from "./goRoomFileSave";
import type { RoomFileWritable } from "./goRoomFileSave";
import { GO_ROOM_HANG_FILES_ONLY } from "./goRoom";
import { createRoomPlaySink, type RoomPlaySink } from "./goRoomFilePlay";
import {
  registerLocalRoomFile,
  unregisterLocalRoomFile,
  waitRoomPlaySw,
} from "./goRoomPlayBridge";
import { fileShareKind } from "./goRoomFileShare";
import {
  SESSION_FILE_PLAY_MAX_INFLIGHT,
  SESSION_FILE_PLAY_SEEK_SLACK,
  roomFileContentType,
  roomFilePath,
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

export type RoomFileBrowserDownload =
  | { ok: true; id: string; url: string; name: string }
  | { ok: false; error: string };

export type RoomFileTransfer = {
  shareLocalFile(file: File): Promise<RoomFileResult>;
  shareLocalDirectory(files: File[]): Promise<RoomFileResult>;
  unshareLocal(id: string): boolean;
  unshare(id: string, opts?: { host?: boolean }): boolean;
  download(id: string, pickSave: RoomFilePickSave): Promise<RoomFileResult>;
  /**
   * Same-origin `/room-file/<id>` for the owner's File (SW serves locally).
   * Remote must use download()+fetch.
   */
  primeBrowserDownload(id: string): RoomFileBrowserDownload;
  /** SW download stream cancelled (Safari early abort) — release busy UI. */
  cancelHttpSave(fileId: string): void;
  /** User cancelled an in-flight download (abort fetch＋DC; soft listed). */
  cancelDownload(fileId: string): void;
  play(id: string): Promise<RoomFileResult>;
  /**
   * SW opened one HTTP roundtrip — page only relays session_file.request
   * with SW’s transferId (never invents ids).
   */
  acceptHttpTransfer(msg: {
    fileId: string;
    transferId: string;
    offset: number;
    end?: number;
    purpose?: "play" | "save";
  }): RoomFileResult;
  /**
   * SW finished (or aborted) delivering this HTTP body — completion authority.
   * Owner session_file.done alone must not mark success.
   */
  noteHttpTransferEnd(msg: {
    fileId: string;
    transferId: string;
    ok: boolean;
    delivered?: number;
    reason?: string;
  }): void;
  /**
   * Resume an in-flight transfer near offset. Does not open transfers —
   * new Ranges are HTTP → SW → acceptHttpTransfer.
   */
  seekPlay(offset: number, forFileId?: string): Promise<RoomFileResult>;
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
    mode?: "play" | "save";
  }) => RoomPlaySink;
  /** Test／in-process HTTP façade; production defaults to fetch(url). */
  fetchRoomFile?: (
    url: string,
    init?: { signal?: AbortSignal }
  ) => Promise<Response>;
  /** Register owned File for `/room-file/<id>` (no DC). */
  registerLocalFile?: (id: string, file: File) => void;
  unregisterLocalFile?: (id: string) => void;
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
  /** Declared HTTP body size for this transfer (Range length or remainder). */
  expectBytes: number;
  writable?: RoomFileWritable;
  mime?: string;
  name?: string;
  playPaused?: boolean;
  /** Owner session_file.done — source exhausted; not HTTP success. */
  sourceDone?: boolean;
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
  /** File id for the open `/room-file/` session (play or download). */
  let httpFileId: string | null = null;
  /**
   * SW already delivered a full save body for this file id (transfer-complete).
   * Edge／Chrome often cancel() + reopen GET; ignore those probes so 下載／預覽
   * stay enabled and busy clears.
   */
  const saveSwComplete = new Set<string>();
  let lastSeekOpenAt = -1;
  let lastSeekOpenTs = 0;
  let activeDownload: {
    fileId: string;
    abort: AbortController;
    writable: RoomFileWritable | null;
    userCancelled: boolean;
  } | null = null;
  /** Safari: resolve when DC save mirror has the full file so pipe can drain. */
  let saveMirrorDrainResolve: (() => void) | null = null;
  /** Latched if owner done arrives before pipe subscribes to mirrorDrain. */
  let saveMirrorReadyFileId: string | null = null;
  const makePlaySink =
    deps.createPlaySink ??
    ((opts: {
      mime?: string;
      name?: string;
      size?: number;
      playId?: string;
      mode?: "play" | "save";
    }) => createRoomPlaySink(opts));
  const fetchRoomFile =
    deps.fetchRoomFile ??
    ((url: string, init?: { signal?: AbortSignal }) => fetch(url, init));
  const registerLocal =
    deps.registerLocalFile ??
    ((id: string, file: File) => {
      registerLocalRoomFile(id, file);
    });
  const unregisterLocal =
    deps.unregisterLocalFile ??
    ((id: string) => {
      unregisterLocalRoomFile(id);
    });

  function playInbounds(): Inbound[] {
    return [...inbounds.values()].filter((i) => i.purpose === "play");
  }

  function clearHttpSink(): void {
    playSink?.destroy();
    playSink = null;
    httpFileId = null;
    lastSeekOpenAt = -1;
    lastSeekOpenTs = 0;
  }

  function busy(): boolean {
    return (
      inbounds.size > 0 ||
      outboundPumps.size > 0 ||
      /**
       * Remote download HTTP session (not private play). Once SW has delivered
       * the save body, Edge may keep the page fetch open while closing the
       * writable — do not keep busy latched (blocks 預覽／下一檔).
       */
      (httpFileId != null &&
        playback == null &&
        !saveSwComplete.has(httpFileId))
    );
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
    clearHttpSink();
    if (playback?.url?.startsWith("blob:")) {
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
    for (const cur of inbounds.values()) {
      if (cur.purpose !== "play" && cur.purpose !== "save") continue;
      if (pressure === "high" && !cur.playPaused) {
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
    startOffset = 0,
    length?: number
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
    const limit =
      typeof length === "number" && Number.isFinite(length) && length > 0
        ? Math.min(file.size, from + Math.floor(length))
        : file.size;
    patch(fileId, { status: "transferring", received: from, error: undefined });
    try {
      let offset = from;
      let seq = 0;
      while (offset < limit) {
        if (pump.abort) return;
        while (pump.paused && !pump.abort) {
          await new Promise((r) => setTimeout(r, 16));
        }
        if (pump.abort) return;
        await waitDrain(destPeerId);
        if (pump.abort) return;
        const end = Math.min(offset + SESSION_FILE_CHUNK_PAYLOAD_MAX, limit);
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
      patch(fileId, {
        status: "listed",
        received: Math.max(
          entries.find((e) => e.id === fileId)?.received ?? 0,
          limit
        ),
      });
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
    const mime = roomFileContentType(file.type, name) || undefined;
    outboundFiles.set(id, file);
    try {
      registerLocal(id, file);
    } catch {
      /* SW may be missing in tests without registerLocalFile dep */
    }
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
    for (const gone of drop) {
      outboundFiles.delete(gone);
      try {
        unregisterLocal(gone);
      } catch {
        /* ignore */
      }
    }
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
      if (!outboundFiles.get(id)) return { ok: false, error: "找不到這個檔" };
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
      await waitRoomPlaySw();
      const abort = new AbortController();
      activeDownload = {
        fileId: id,
        abort,
        writable,
        userCancelled: false,
      };
      try {
        const res = await fetchRoomFile(roomFilePath(id), {
          signal: abort.signal,
        });
        if (!res.ok && res.status !== 206) {
          throw new Error(
            res.status === 404 ? "找不到這個檔" : `下載失敗（HTTP ${res.status}）`
          );
        }
        const expectLen = (() => {
          const raw = res.headers.get("Content-Length");
          if (raw == null || raw === "") return entry.size;
          const n = Number(raw);
          return Number.isFinite(n) && n >= 0 ? n : entry.size;
        })();
        const written = await pipeResponseToWritable(res.body, writable, {
          expectLen,
        });
        if (written !== expectLen) throw new Error("檔案不完整");
        return { ok: true, id };
      } catch (e) {
        if (activeDownload?.fileId === id && activeDownload.userCancelled) {
          return { ok: false, error: "已取消", cancelled: true };
        }
        if (e instanceof DOMException && e.name === "AbortError") {
          return { ok: false, error: "已取消", cancelled: true };
        }
        const msg = e instanceof Error ? e.message : "下載失敗";
        return { ok: false, error: msg };
      } finally {
        if (activeDownload?.fileId === id) activeDownload = null;
      }
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
    await waitRoomPlaySw();
    /** Drop private-play state so save-cancel／transfer-end can clear this HTTP session. */
    revokePlayback();
    saveSwComplete.delete(id);
    if (saveMirrorReadyFileId === id) saveMirrorReadyFileId = null;
    playSink = makePlaySink({
      mime: entry.mime,
      name: entry.name,
      size: entry.size,
      playId: id,
      mode: "save",
    });
    httpFileId = id;
    const abort = new AbortController();
    activeDownload = {
      fileId: id,
      abort,
      writable,
      userCancelled: false,
    };
    patch(id, { status: "transferring", received: 0, error: undefined });
    emit();
    /** Transfer opens when SW handles this GET (open-transfer → acceptHttpTransfer). */
    try {
      const res = await fetchRoomFile(roomFilePath(id), {
        signal: abort.signal,
      });
      if (!res.ok && res.status !== 206) {
        throw new Error(
          res.status === 404 ? "找不到這個檔" : `下載失敗（HTTP ${res.status}）`
        );
      }
      const expectLen = (() => {
        const raw = res.headers.get("Content-Length");
        if (raw == null || raw === "") return entry.size;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 0 ? n : entry.size;
      })();
      const mirrorDrain = new Promise<void>((resolve) => {
        saveMirrorDrainResolve = resolve;
        if (saveMirrorReadyFileId === id) resolve();
      });
      const written = await pipeResponseToWritable(res.body, writable, {
        expectLen,
        onProgress: (n) => playSink?.noteSaveConsumed?.(n),
        mirrorDrain,
        readMirror: (start, end) => playSink?.read?.(start, end) ?? null,
      });
      saveMirrorDrainResolve = null;
      if (saveMirrorReadyFileId === id) saveMirrorReadyFileId = null;
      if (written !== expectLen) {
        throw new Error("檔案不完整");
      }
      saveSwComplete.add(id);
      for (const cur of [...inbounds.values()]) {
        if (cur.fileId === id && cur.purpose === "save") {
          inbounds.delete(cur.transferId);
        }
      }
      playSink?.end();
      clearHttpSink();
      patch(id, { status: "listed", received: entry.size, error: undefined });
      emit();
      return { ok: true, id };
    } catch (e) {
      const cancelled =
        (activeDownload?.fileId === id && activeDownload.userCancelled) ||
        (e instanceof DOMException && e.name === "AbortError");
      for (const cur of [...inbounds.values()]) {
        if (cur.fileId !== id || cur.purpose !== "save") continue;
        sendSafe(
          buildSessionFileControl({
            op: "cancel",
            id,
            transferId: cur.transferId,
          })
        );
        inbounds.delete(cur.transferId);
      }
      clearHttpSink();
      if (cancelled) {
        saveSwComplete.delete(id);
        patch(id, { status: "listed", error: undefined });
        emit();
        return { ok: false, error: "已取消", cancelled: true };
      }
      const msg = e instanceof Error ? e.message : "下載失敗";
      patch(id, { status: "error", error: msg });
      emit();
      return { ok: false, error: msg };
    } finally {
      saveMirrorDrainResolve = null;
      if (saveMirrorReadyFileId === id) saveMirrorReadyFileId = null;
      if (activeDownload?.fileId === id) activeDownload = null;
      if (httpFileId === id) clearHttpSink();
      const cur = entries.find((e) => e.id === id);
      if (cur?.status === "transferring") {
        patch(id, {
          status: "listed",
          received: Math.max(cur.received, entry.size),
          error: undefined,
        });
        emit();
      }
    }
  }

  /**
   * Same-origin `/room-file/<id>` for local File (SW serves; no blob: product path).
   */
  function primeBrowserDownload(id: string): RoomFileBrowserDownload {
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      return { ok: false, error: "找不到這個檔" };
    }
    if (entry.kind === "dir" || entry.kind === "device") {
      return { ok: false, error: GO_ROOM_HANG_FILES_ONLY };
    }
    if (!entry.mine) {
      return {
        ok: false,
        error: "請用下載按鈕（頁面會以 HTTP fetch 存檔）",
      };
    }
    if (!outboundFiles.get(id)) return { ok: false, error: "找不到這個檔" };
    return { ok: true, id, url: roomFilePath(id), name: entry.name };
  }

  function cancelHttpSave(fileId: string): void {
    for (const cur of [...inbounds.values()]) {
      if (cur.fileId !== fileId || cur.purpose !== "save") continue;
      sendSafe(
        buildSessionFileControl({
          op: "cancel",
          id: cur.fileId,
          transferId: cur.transferId,
        })
      );
      void closeInbound(cur, false, "下載已中斷");
    }
    if (httpFileId === fileId) {
      /** End (not abort) so a retry GET can still find the session. */
      playSink?.end();
      playSink = null;
      httpFileId = null;
      lastSeekOpenAt = -1;
      lastSeekOpenTs = 0;
      const cur = entries.find((e) => e.id === fileId);
      if (cur?.status === "transferring") {
        patch(fileId, { status: "listed", error: undefined });
      }
      emit();
    }
  }

  /** Explicit user cancel — abort fetch／writable and stop the DC save. */
  function cancelDownload(fileId: string): void {
    if (activeDownload?.fileId === fileId) {
      activeDownload.userCancelled = true;
      try {
        activeDownload.abort.abort();
      } catch {
        /* ignore */
      }
      try {
        void activeDownload.writable?.abort?.();
      } catch {
        /* ignore */
      }
    }
    saveSwComplete.delete(fileId);
    cancelHttpSave(fileId);
    const cur = entries.find((e) => e.id === fileId);
    if (
      cur &&
      (cur.status === "transferring" ||
        cur.status === "error" ||
        cur.error === "下載已中斷")
    ) {
      patch(fileId, { status: "listed", error: undefined });
    }
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
      if (!outboundFiles.get(id)) return { ok: false, error: "找不到這個檔" };
      revokePlayback();
      await waitRoomPlaySw();
      playback = {
        id,
        url: roomFilePath(id),
        name: entry.name,
        mime: roomFileContentType(entry.mime, entry.name),
        kind: playbackKindOf(entry.mime, entry.name),
      };
      emit();
      return { ok: true, id };
    }
    if (busy()) {
      return { ok: false, error: "一次只能傳一個檔" };
    }
    revokePlayback();
    await waitRoomPlaySw();
    playSink = makePlaySink({
      mime: roomFileContentType(entry.mime, entry.name),
      name: entry.name,
      size: entry.size,
      /** Stable per file so remount／re-play keeps the same `/room-file/<id>`. */
      playId: id,
    });
    httpFileId = id;
    playback = {
      id,
      url: playSink.url,
      name: entry.name,
      mime: roomFileContentType(entry.mime, entry.name),
      kind: playbackKindOf(entry.mime, entry.name),
    };
    /** HTTP Ranges open transfers via SW open-transfer → acceptHttpTransfer. */
    patch(id, { status: "transferring", received: 0, error: undefined });
    emit();
    return { ok: true, id };
  }

  function acceptHttpTransfer(msg: {
    fileId: string;
    transferId: string;
    offset: number;
    end?: number;
    purpose?: "play" | "save";
  }): RoomFileResult {
    const fileId = msg.fileId;
    const transferId =
      typeof msg.transferId === "string" ? msg.transferId.trim() : "";
    if (!transferId) {
      return { ok: false, error: "缺少 transferId" };
    }
    if (inbounds.has(transferId)) {
      return { ok: true, id: fileId };
    }
    const at = Math.floor(msg.offset);
    if (!Number.isFinite(at) || at < 0) {
      return { ok: false, error: "無法跳到那裡" };
    }
    const activeId = playback?.id ?? httpFileId;
    if (!activeId || !playSink) {
      return { ok: false, error: "沒有在播放" };
    }
    if (fileId !== activeId) {
      return { ok: false, error: "沒有在播放" };
    }
    const entry = entries.find((e) => e.id === fileId);
    if (!entry || entry.mine) {
      return { ok: true, id: fileId };
    }
    if (at >= entry.size) {
      return { ok: false, error: "無法跳到那裡" };
    }
    if (
      [...inbounds.values()].some(
        (i) => i.purpose === "save" && i.fileId !== fileId
      )
    ) {
      return { ok: false, error: "一次只能傳一個檔" };
    }
    const purpose =
      msg.purpose === "save" || (!playback && httpFileId === fileId)
        ? "save"
        : "play";
    /**
     * Edge／Chrome often cancel() a finished save body then reopen GET.
     * SW already delivered — do not open another DC transfer or flip UI busy.
     */
    if (purpose === "save" && saveSwComplete.has(fileId)) {
      return { ok: true, id: fileId };
    }
    /** Far seek: drop transfers that cannot serve this offset. */
    for (const cur of [...inbounds.values()]) {
      if (cur.fileId !== fileId) continue;
      if (cur.purpose === "save" && cur.baseOffset === 0) continue;
      const pumped = cur.baseOffset + cur.received;
      const near =
        at >= cur.baseOffset - SESSION_FILE_PLAY_SEEK_SLACK &&
        at <= pumped + SESSION_FILE_PLAY_SEEK_SLACK;
      if (!near) dropPlayInbound(cur);
    }
    const victim = evictPlayInboundFor(at);
    if (victim) dropPlayInbound(victim);
    lastSeekOpenAt = at;
    lastSeekOpenTs = Date.now();
    const endInclusive =
      typeof msg.end === "number" && Number.isFinite(msg.end)
        ? Math.floor(msg.end)
        : undefined;
    const expectBytes =
      endInclusive !== undefined && endInclusive >= at
        ? Math.min(entry.size - at, endInclusive - at + 1)
        : Math.max(0, entry.size - at);
    if (expectBytes <= 0) {
      return { ok: false, error: "無法跳到那裡" };
    }
    inbounds.set(transferId, {
      fileId,
      transferId,
      received: 0,
      size: entry.size,
      writes: Promise.resolve(),
      purpose,
      baseOffset: at,
      expectBytes,
      mime: entry.mime,
      name: entry.name,
      playPaused: false,
    });
    patch(fileId, {
      status: "transferring",
      received: Math.max(entry.received, at, playReceivedAbs(fileId)),
      error: undefined,
    });
    sendSafe(
      buildSessionFileControl({
        op: "request",
        id: fileId,
        transferId,
        from: deps.localAgentId,
        offset: at,
        length: expectBytes,
      })
    );
    emit();
    return { ok: true, id: fileId };
  }

  async function seekPlay(
    offset: number,
    forFileId?: string
  ): Promise<RoomFileResult> {
    const at = Math.floor(offset);
    if (!Number.isFinite(at) || at < 0) {
      return { ok: false, error: "無法跳到那裡" };
    }
    const fileId = playback?.id ?? httpFileId;
    if (!fileId || !playSink) {
      return { ok: false, error: "沒有在播放" };
    }
    if (forFileId && forFileId !== fileId) {
      return { ok: false, error: "沒有在播放" };
    }
    const entry = entries.find((e) => e.id === fileId);
    if (!entry || entry.mine) {
      return { ok: true, id: fileId };
    }
    if (at >= entry.size) {
      return { ok: false, error: "無法跳到那裡" };
    }
    if (playSink.covers?.(at, Math.min(entry.size, at + 1))) {
      return { ok: true, id: fileId };
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
    for (const cur of inbounds.values()) {
      if (cur.fileId !== fileId) continue;
      const pumped = cur.baseOffset + cur.received;
      if (at >= cur.baseOffset && at <= pumped + SESSION_FILE_PLAY_SEEK_SLACK) {
        resumePlay(cur);
        return { ok: true, id: fileId };
      }
    }
    /** Far seek is a new HTTP Range — page must not invent transferIds. */
    return { ok: true, id: fileId };
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
    /**
     * Stop owner pump for this transferId — SW already finished (or aborted)
     * the HTTP body; further chunks are wasted.
     */
    sendSafe(
      buildSessionFileControl({
        op: "cancel",
        id: cur.fileId,
        transferId: cur.transferId,
      })
    );
    try {
      await cur.writes;
      if (cur.purpose === "save" && cur.writable) {
        if (ok) await cur.writable.close();
        else await cur.writable.abort?.();
      }
    } catch {
      /* ignore close errors */
    }
    if (ok && (cur.purpose === "play" || cur.purpose === "save")) {
      const expect = cur.expectBytes;
      if (cur.received !== expect) {
        patch(cur.fileId, {
          status: "error",
          error: "檔案不完整",
        });
        /** end only — fetch／`<a download>` may still be reading buffered spans. */
        if (cur.purpose === "save") playSink?.end();
        return;
      }
      const stillOpen = [...inbounds.values()].some(
        (i) => i.fileId === cur.fileId
      );
      if (!stillOpen) {
        /**
         * HTTP save: DC often finishes while fetch is still piping.
         * Do NOT end here — a premature end + trimmed hole → Safari「檔案不完整」.
         * download() ends after written === Content-Length.
         *
         * Play: leave the sink open — media may open further Ranges／seeks.
         */
        if (cur.purpose === "save" && cur.writable) {
          playSink?.end();
        }
        if (playback && playSink && playback.id === cur.fileId) {
          playback = { ...playback, url: playSink.url };
        }
      }
    }
    if (ok) {
      if (cur.purpose === "save" && !cur.writable) {
        /**
         * SW already delivered the HTTP body (transfer-complete). Re-enable the
         * Download button — do not leave status stuck on transferring (Safari
         * often cancel()s after a successful body; download() may still be
         * closing the writable / blob bridge).
         * Mark complete so Edge／Chrome reopen GET does not flip back to busy.
         */
        saveSwComplete.add(cur.fileId);
        patch(cur.fileId, {
          status: "listed",
          received: cur.size,
          error: undefined,
        });
      } else if (cur.purpose !== "play" || playInbounds().length === 0) {
        if (cur.purpose === "save") saveSwComplete.add(cur.fileId);
        patch(cur.fileId, {
          status: "listed",
          received:
            cur.purpose === "play"
              ? playReceivedAbs(cur.fileId)
              : cur.size,
          error: undefined,
        });
      }
    } else {
      if (cur.purpose === "save") saveSwComplete.delete(cur.fileId);
      if (cur.purpose === "play" && playInbounds().length === 0) {
        revokePlayback();
      }
      /**
       * HTTP save: end the session so the fetch body can finish／fail cleanly.
       * Do NOT abort/destroy — that deletes SW spans and the next GET 404s as
       * 「找不到這個檔」(Chrome／Safari often cancel＋retry the stream).
       */
      if (cur.purpose === "save" && !cur.writable) {
        playSink?.end();
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
      void pumpOutbound(
        data.id,
        file,
        transferId,
        data.from,
        data.offset ?? 0,
        data.length
      );
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
          cur.sourceDone = true;
          if (cur.received === cur.expectBytes) {
            patch(cur.fileId, {
              received:
                cur.purpose === "play"
                  ? playReceivedAbs(cur.fileId)
                  : cur.size,
              error: undefined,
            });
            /**
             * Safari: fetch often stalls with the last few MiB stuck in the
             * Response buffer while DC already finished. Signal pipe to drain
             * the page mirror (pin is capped by writable progress).
             */
            if (cur.purpose === "save") {
              /** Do not playSink.end() here — Edge／Safari fetch may still be reading. */
              saveMirrorReadyFileId = cur.fileId;
              saveMirrorDrainResolve?.();
              saveMirrorDrainResolve = null;
            }
          }
          /**
           * Owner done = source exhausted only. Do not closeInbound / mark
           * listed — wait for SW transfer-complete／abort (HTTP delivery),
           * or Safari mirror drain above.
           */
        });
      }
    }
  }

  function noteHttpTransferEnd(msg: {
    fileId: string;
    transferId: string;
    ok: boolean;
    delivered?: number;
    reason?: string;
  }): void {
    const cur = inbounds.get(msg.transferId);
    if (!cur || cur.fileId !== msg.fileId) return;
    /**
     * Mirror-drain／expectLen complete cancels the fetch reader — SW may post
     * transfer-abort. Do not flip the row to error while download() owns the
     * outcome (or after save already marked complete).
     */
    if (
      !msg.ok &&
      cur.purpose === "save" &&
      (saveSwComplete.has(msg.fileId) ||
        activeDownload?.fileId === msg.fileId)
    ) {
      inbounds.delete(msg.transferId);
      return;
    }
    if (msg.ok) {
      const expect = cur.expectBytes;
      const delivered =
        typeof msg.delivered === "number" && Number.isFinite(msg.delivered)
          ? Math.max(0, Math.floor(msg.delivered))
          : undefined;
      /** SW-delivered body size is the completion authority for this Range. */
      if (delivered === expect || cur.received === expect) {
        cur.received = expect;
        void closeInbound(cur, true);
        return;
      }
      void closeInbound(cur, false, "檔案不完整");
      return;
    }
    const reason =
      msg.reason === "incomplete" || msg.reason?.includes("incomplete")
        ? "檔案不完整"
        : msg.reason || "下載失敗";
    void closeInbound(cur, false, reason);
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
    const rangeEnd = cur.baseOffset + cur.expectBytes;
    if (at + chunk.payload.byteLength > Math.min(cur.size, rangeEnd)) {
      void closeInbound(cur, false, "檔案超過宣告大小");
      return;
    }
    const payload = chunk.payload;
    cur.writes = cur.writes.then(async () => {
      if (inbounds.get(cur.transferId) !== cur) return;
      if (cur.purpose === "play" || cur.purpose === "save") {
        if (!playSink) return;
        const end = Math.min(cur.size, at + payload.byteLength);
        const pressure = await playSink.append(payload, at);
        if (inbounds.get(cur.transferId) !== cur || !playSink) return;
        /** append waits until stored — only then advance received. */
        const stored = playSink.covers?.(at, end) ?? true;
        if (!stored) {
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
          return;
        }
        cur.received = nextGot;
        patch(cur.fileId, {
          received:
            cur.purpose === "play"
              ? playReceivedAbs(cur.fileId)
              : at + payload.byteLength,
        });
        applyPlayPressure(pressure);
        return;
      }
    });
  }

  function dispose(): void {
    for (const p of outboundPumps.values()) p.abort = true;
    for (const cur of inbounds.values()) void cur.writable?.abort?.();
    inbounds.clear();
    for (const id of outboundFiles.keys()) {
      try {
        unregisterLocal(id);
      } catch {
        /* ignore */
      }
    }
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
    primeBrowserDownload,
    cancelHttpSave,
    cancelDownload,
    play,
    acceptHttpTransfer,
    noteHttpTransferEnd,
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
