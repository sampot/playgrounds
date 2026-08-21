/**
 * 包廂檔案播放／檢視：滑動窗口，不把整檔緩進 JS。
 * 遠端檔走同一 origin 的 `/room-file/<id>`（SW＝標準 HTTP；bytes 仍走 DC）。
 * 無 playId 時（測試）走 byte window。不做格式特判／remux。
 */

import {
  SESSION_FILE_PLAY_BUFFER_HIGH,
  SESSION_FILE_PLAY_BUFFER_LOW,
  SESSION_FILE_PLAY_BUFFER_MAX,
  defaultRoomPlaySessions,
  roomFilePath,
  type RoomPlayRegistry,
} from "./goRoomPlayRegistry";
import { listenRoomPlayPin, notifyRoomPlaySw } from "./goRoomPlayBridge";

export {
  SESSION_FILE_PLAY_BUFFER_HIGH,
  SESSION_FILE_PLAY_BUFFER_LOW,
  SESSION_FILE_PLAY_BUFFER_MAX,
} from "./goRoomPlayRegistry";

export type PlayPressure = "ok" | "high" | "low";

export type RoomPlaySink = {
  url: string;
  append(chunk: Uint8Array, fileOffset?: number): Promise<PlayPressure>;
  evictUntil(seconds: number): Promise<PlayPressure>;
  end(): void;
  destroy(): void;
  bufferedBytes(): number;
  covers?(start: number, end: number): boolean;
  /**
   * Save mode: bytes the page fetch／writable has actually kept.
   * Page trim must not advance past this (SW pin can race ahead under WebKit).
   */
  noteSaveConsumed?(at: number): void;
  /** Read a covered range from the page mirror (save drain fallback). */
  read?(start: number, end: number): Uint8Array | null;
  /** True if [at, at+len) overlaps an active HTTP pin window. */
  inPinWindow?(at: number, len: number): boolean;
  /**
   * Open a page-side pin so far-seek chunks can store before the SW HTTP
   * reader reports its cursor (avoids dropping mid-file Ranges).
   */
  primePin?(streamKey: string, at: number): void;
  clearPin?(streamKey: string): void;
  /** Drop in-flight append waiters (Range cancelled／superseded). */
  interruptAppends?(): void;
};

/**
 * Save-mode page trim pin: never drop bytes the writable has not consumed yet,
 * even if the SW HTTP pin raced ahead (WebKit buffers the Response body).
 */
export function savePageTrimPin(
  writableConsumed: number,
  swPin: number | null
): number {
  const consumed = Math.max(0, Math.floor(writableConsumed));
  if (swPin == null || !Number.isFinite(swPin)) return consumed;
  return Math.max(0, Math.min(consumed, Math.floor(swPin)));
}

export type PlaySinkOpts = {
  mime?: string;
  name?: string;
  size?: number;
  playId?: string;
  maxBytes?: number;
  highBytes?: number;
  lowBytes?: number;
  sessions?: RoomPlayRegistry;
  /** Stream-through download — see RoomPlayOpenOpts.mode. */
  mode?: "play" | "save";
};

function pressureOf(
  bytes: number,
  high: number,
  low: number
): PlayPressure {
  if (bytes >= high) return "high";
  if (bytes <= low) return "low";
  return "ok";
}

function blobUrl(mime: string): string {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return "blob:play";
  }
  return URL.createObjectURL(new Blob([], { type: mime }));
}

export function createImagePreviewSink(opts: PlaySinkOpts = {}): RoomPlaySink {
  const maxBytes = opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX;
  const mime = opts.mime || "image/jpeg";
  let url = blobUrl(mime);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  let dead = false;

  return {
    get url() {
      return url;
    },
    async append(chunk: Uint8Array) {
      if (dead) return "low";
      if (bytes + chunk.byteLength > maxBytes) return "high";
      const copy = chunk.slice();
      parts.push(copy);
      bytes += copy.byteLength;
      return pressureOf(bytes, maxBytes, 0);
    },
    async evictUntil() {
      if (dead) return "low";
      return pressureOf(bytes, maxBytes, 0);
    },
    end() {
      if (dead) return;
      if (url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
      url = URL.createObjectURL(new Blob(parts, { type: mime }));
    },
    destroy() {
      dead = true;
      parts.length = 0;
      bytes = 0;
      if (url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    },
    bufferedBytes() {
      return bytes;
    },
  };
}

export function createPlayByteWindow(opts: PlaySinkOpts = {}): RoomPlaySink {
  const maxBytes = opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX;
  const highBytes = opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH;
  const lowBytes = opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW;
  const mime = opts.mime || "application/octet-stream";
  const url = blobUrl(mime);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  let dead = false;

  function dropOld(): void {
    while (bytes > maxBytes && parts.length > 1) {
      const gone = parts.shift();
      if (!gone) break;
      bytes -= gone.byteLength;
    }
  }

  return {
    url,
    async append(chunk: Uint8Array) {
      if (dead) return "low";
      const copy = chunk.slice();
      parts.push(copy);
      bytes += copy.byteLength;
      dropOld();
      return pressureOf(bytes, highBytes, lowBytes);
    },
    async evictUntil(_seconds: number) {
      if (dead) return "low";
      return pressureOf(bytes, highBytes, lowBytes);
    },
    end() {},
    destroy() {
      dead = true;
      parts.length = 0;
      bytes = 0;
      if (url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    },
    bufferedBytes() {
      return bytes;
    },
  };
}

/** Page-side mirror of SW `/room-file/` bytes; HTTP GETs are served by the SW. */
export function createRegistryPlaySink(opts: PlaySinkOpts = {}): RoomPlaySink {
  const sessions = opts.sessions ?? defaultRoomPlaySessions;
  const playId =
    opts.playId ?? `play-${Math.random().toString(36).slice(2, 10)}`;
  const mime = opts.mime || "application/octet-stream";
  const size = opts.size ?? 0;
  const highBytes = opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH;
  const lowBytes = opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW;
  const saveMode = opts.mode === "save";
  sessions.open(playId, {
    mime,
    size,
    maxBytes: opts.maxBytes,
    highBytes,
    lowBytes,
    mode: saveMode ? "save" : "play",
  });
  notifyRoomPlaySw({
    type: "go-room-play",
    op: "open",
    id: playId,
    mime,
    size,
    name: opts.name,
  });
  let dead = false;
  /** Bumped when a Range is dropped so in-flight append waitSpace loops exit. */
  let appendEpoch = 0;
  /** Save: SW may report pin ahead of fetch→writable; trim uses the min. */
  let writableConsumed = 0;
  const swPins = new Map<string, number>();
  const SAVE_TRIM_KEY = "page-save-trim";

  function applySaveTrimPin(): void {
    if (!saveMode || dead) return;
    let swMin: number | null = null;
    for (const p of swPins.values()) {
      swMin = swMin == null ? p : Math.min(swMin, p);
    }
    const at = savePageTrimPin(writableConsumed, swMin);
    sessions.pin(playId, SAVE_TRIM_KEY, at);
  }

  const stopPin = listenRoomPlayPin((id, streamKey, at) => {
    if (dead || id !== playId) return;
    if (saveMode) {
      if (at == null) swPins.delete(streamKey);
      else swPins.set(streamKey, at);
      applySaveTrimPin();
      return;
    }
    if (at == null) sessions.unpin(playId, streamKey);
    else sessions.pin(playId, streamKey, at);
  });

  return {
    get url() {
      return roomFilePath(playId, { purpose: saveMode ? "save" : "play" });
    },
    async append(chunk, fileOffset) {
      if (dead) return "low";
      const copy = chunk.slice();
      const at = fileOffset ?? 0;
      const end = at + copy.byteLength;
      let pressure: PlayPressure = "low";
      const epoch = appendEpoch;
      /**
       * Stream-through save／play: never skip a sequential chunk because the
       * 32 MiB pin window has not advanced yet — wait for the HTTP reader.
       * Outside the pin window (far seek): waitPin only — waitSpace would be
       * woken by every other-offset push and freeze Edge's main thread.
       */
      while (!dead && epoch === appendEpoch) {
        pressure = sessions.push(playId, copy, at);
        if (sessions.covers(playId, at, end)) break;
        if (!sessions.inPinWindow(playId, at, copy.byteLength)) {
          await sessions.waitPin(playId, at, copy.byteLength);
        } else {
          await sessions.waitSpace(playId);
        }
      }
      if (dead || epoch !== appendEpoch || !sessions.covers(playId, at, end)) {
        return "low";
      }
      const bytes = copy.buffer.slice(
        copy.byteOffset,
        copy.byteOffset + copy.byteLength
      );
      notifyRoomPlaySw({
        type: "go-room-play",
        op: "chunk",
        id: playId,
        at,
        bytes,
      });
      return pressure;
    },
    covers(start, end) {
      return sessions.covers(playId, start, end);
    },
    inPinWindow(at, len) {
      return sessions.inPinWindow(playId, at, len);
    },
    read(start, end) {
      return sessions.read(playId, start, end);
    },
    primePin(streamKey, at) {
      if (dead) return;
      sessions.pin(playId, streamKey, Math.max(0, Math.floor(at)));
    },
    clearPin(streamKey) {
      if (dead) return;
      sessions.unpin(playId, streamKey);
    },
    interruptAppends() {
      appendEpoch += 1;
      sessions.wakeWaiters(playId);
    },
    noteSaveConsumed(at) {
      if (!saveMode || dead) return;
      writableConsumed = Math.max(writableConsumed, Math.floor(at));
      applySaveTrimPin();
    },
    async evictUntil() {
      if (dead) return "low";
      const n = sessions.bufferedBytes(playId);
      if (n >= highBytes) return "high";
      if (n <= lowBytes) return "low";
      return "ok";
    },
    end() {
      if (dead) return;
      sessions.end(playId);
      notifyRoomPlaySw({ type: "go-room-play", op: "end", id: playId });
    },
    destroy() {
      dead = true;
      stopPin();
      sessions.abort(playId);
      notifyRoomPlaySw({ type: "go-room-play", op: "abort", id: playId });
    },
    bufferedBytes() {
      return sessions.bufferedBytes(playId);
    },
  };
}

export function createRoomPlaySink(opts: PlaySinkOpts = {}): RoomPlaySink {
  if (opts.sessions || opts.playId) return createRegistryPlaySink(opts);
  return createPlayByteWindow(opts);
}
