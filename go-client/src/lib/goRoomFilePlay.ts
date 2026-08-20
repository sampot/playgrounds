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
};

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
  sessions.open(playId, {
    mime,
    size,
    maxBytes: opts.maxBytes,
    highBytes,
    lowBytes,
    mode: opts.mode === "save" ? "save" : "play",
  });
  notifyRoomPlaySw({
    type: "go-room-play",
    op: "open",
    id: playId,
    mime,
    size,
    name: opts.name,
    mode: opts.mode === "save" ? "save" : "play",
  });
  let dead = false;
  const stopPin = listenRoomPlayPin((id, streamKey, at) => {
    if (dead || id !== playId) return;
    if (at == null) sessions.unpin(playId, streamKey);
    else sessions.pin(playId, streamKey, at);
  });

  return {
    get url() {
      return roomFilePath(playId);
    },
    async append(chunk, fileOffset) {
      if (dead) return "low";
      const copy = chunk.slice();
      const at = fileOffset ?? 0;
      const end = at + copy.byteLength;
      let pressure: PlayPressure = "low";
      /**
       * Stream-through save／play: never skip a sequential chunk because the
       * 32 MiB pin window has not advanced yet — wait for the HTTP reader.
       * Only notify the SW after the page mirror actually stores the bytes.
       */
      while (!dead) {
        pressure = sessions.push(playId, copy, at);
        if (sessions.covers(playId, at, end)) break;
        await sessions.waitSpace(playId);
      }
      if (dead || !sessions.covers(playId, at, end)) return "low";
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
