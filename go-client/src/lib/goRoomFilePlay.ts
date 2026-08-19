/**
 * 包廂檔案播放：滑動窗口，不把整檔緩進 JS。
 * Node／測試走 byte window；瀏覽器走 MediaSource（mp4 經 mp4box 轉 fMP4）。
 */

export const SESSION_FILE_PLAY_BUFFER_MAX = 32 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_HIGH = 24 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_LOW = 8 * 1024 * 1024;

export type PlayPressure = "ok" | "high" | "low";

export type RoomPlaySink = {
  url: string;
  append(chunk: Uint8Array): Promise<PlayPressure>;
  evictUntil(seconds: number): Promise<PlayPressure>;
  end(): void;
  destroy(): void;
  bufferedBytes(): number;
};

export type PlaySinkOpts = {
  mime?: string;
  name?: string;
  maxBytes?: number;
  highBytes?: number;
  lowBytes?: number;
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

export function createPlayByteWindow(opts: PlaySinkOpts = {}): RoomPlaySink {
  const maxBytes = opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX;
  const highBytes = opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH;
  const lowBytes = opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW;
  const mime = opts.mime || "video/mp4";
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

type Mp4BoxFile = {
  onReady: ((info: {
    mime?: string;
    duration: number;
    timescale: number;
    tracks: { id: number; codec?: string }[];
  }) => void) | null;
  onSegment:
    | ((
        id: number,
        user: unknown,
        buffer: ArrayBuffer,
        sampleNum: number,
        isLast: boolean
      ) => void)
    | null;
  onError: ((e: unknown) => void) | null;
  appendBuffer(data: ArrayBuffer): number | void;
  setSegmentOptions(
    id: number,
    user: unknown,
    opts: { nbSamples: number }
  ): void;
  initializeSegmentation():
    | { buffer: ArrayBuffer }
    | { id: number; buffer: ArrayBuffer }[];
  start(): void;
  flush(): void;
  releaseUsedSamples?(id: number, sampleNum: number): void;
};

function isMp4Like(mime?: string, name?: string): boolean {
  const m = (mime ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  return (
    m.includes("mp4") ||
    m.includes("quicktime") ||
    m.includes("m4a") ||
    m.includes("m4v") ||
    /\.(mp4|m4a|m4v|mov)$/i.test(n)
  );
}

function isRawMseType(mime?: string): string | null {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("audio/mpeg") || m === "audio/mp3") return "audio/mpeg";
  if (m.startsWith("audio/webm")) return "audio/webm; codecs=opus";
  if (m.startsWith("video/webm")) return "video/webm; codecs=vp8,opus";
  return null;
}

function withFileStart(chunk: Uint8Array, fileStart: number): ArrayBuffer {
  const buf = chunk.buffer.slice(
    chunk.byteOffset,
    chunk.byteOffset + chunk.byteLength
  ) as ArrayBuffer & { fileStart: number };
  buf.fileStart = fileStart;
  return buf;
}

async function loadMp4Box(): Promise<{ createFile: () => Mp4BoxFile } | null> {
  try {
    const mod = (await import("mp4box")) as {
      createFile?: () => Mp4BoxFile;
      default?: { createFile?: () => Mp4BoxFile };
    };
    const createFile = mod.createFile ?? mod.default?.createFile;
    if (!createFile) return null;
    return { createFile };
  } catch {
    return null;
  }
}

export function createMsePlaySink(opts: PlaySinkOpts = {}): RoomPlaySink {
  const maxBytes = opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX;
  const highBytes = opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH;
  const lowBytes = opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW;
  const mime = opts.mime || "video/mp4";
  const MediaSrc = (
    globalThis as unknown as { MediaSource?: typeof MediaSource }
  ).MediaSource;
  if (typeof MediaSrc !== "function") {
    return createPlayByteWindow(opts);
  }

  const ms = new MediaSrc();
  const url = URL.createObjectURL(ms);
  const pending: Uint8Array[] = [];
  let queuedBytes = 0;
  let appended = 0;
  let sb: SourceBuffer | null = null;
  let updating = Promise.resolve();
  let dead = false;
  let fileStart = 0;
  let mp4: Mp4BoxFile | null = null;

  function liveBytes(): number {
    return queuedBytes + Math.max(0, appended);
  }

  async function evictIfNeeded(): Promise<void> {
    if (!sb || sb.updating) return;
    if (appended <= maxBytes) return;
    const buf = sb.buffered;
    if (buf.length === 0) return;
    const start = buf.start(0);
    const end = buf.end(buf.length - 1);
    const cut = start + Math.max(0.5, (end - start) * 0.35);
    if (cut <= start + 0.25) return;
    try {
      sb.remove(start, Math.min(cut, end - 0.25));
      appended = Math.floor(appended * 0.65);
      await waitUpdate();
    } catch {
      /* ignore */
    }
  }

  function waitUpdate(): Promise<void> {
    if (!sb || !sb.updating) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        sb?.removeEventListener("updateend", done);
        resolve();
      };
      sb.addEventListener("updateend", done);
    });
  }

  async function appendRaw(chunk: Uint8Array): Promise<void> {
    if (!sb) {
      pending.push(chunk);
      queuedBytes += chunk.byteLength;
      return;
    }
    updating = updating.then(async () => {
      if (dead || !sb) return;
      await evictIfNeeded();
      const copy = chunk.slice();
      try {
        sb.appendBuffer(copy);
        appended += copy.byteLength;
        await waitUpdate();
      } catch {
        /* quota／decode：下一幀再試 */
      }
    });
    await updating;
  }

  async function openRaw(type: string): Promise<void> {
    if (dead || sb) return;
    try {
      sb = ms.addSourceBuffer(type);
    } catch {
      return;
    }
    const queued = pending.splice(0);
    queuedBytes = 0;
    for (const c of queued) await appendRaw(c);
  }

  async function openMp4(): Promise<void> {
    const box = await loadMp4Box();
    if (!box || dead) {
      await openRaw('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
      return;
    }
    const file = box.createFile();
    mp4 = file;
    file.onError = () => {};
    file.onReady = (info) => {
      if (dead || sb) return;
      const codecs = info.tracks
        .map((t) => t.codec)
        .filter((c): c is string => Boolean(c));
      const mseType =
        info.mime && MediaSrc.isTypeSupported(info.mime)
          ? info.mime
          : codecs.length > 0 &&
              MediaSrc.isTypeSupported(`video/mp4; codecs="${codecs.join(", ")}"`)
            ? `video/mp4; codecs="${codecs.join(", ")}"`
            : 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
      try {
        sb = ms.addSourceBuffer(mseType);
      } catch {
        return;
      }
      for (const t of info.tracks) {
        file.setSegmentOptions(t.id, sb, { nbSamples: 30 });
      }
      const inits = file.initializeSegmentation();
      const buffers = Array.isArray(inits) ? inits.map((x) => x.buffer) : [inits.buffer];
      updating = updating.then(async () => {
        if (!sb || dead) return;
        for (const buffer of buffers) {
          sb.appendBuffer(buffer);
          appended += buffer.byteLength;
          await waitUpdate();
        }
        file.start();
      });
    };
    file.onSegment = (_id, _user, buffer, sampleNum) => {
      updating = updating.then(async () => {
        if (dead || !sb) return;
        await evictIfNeeded();
        try {
          sb.appendBuffer(buffer);
          appended += buffer.byteLength;
          await waitUpdate();
          file.releaseUsedSamples?.(_id, sampleNum);
        } catch {
          /* ignore */
        }
      });
    };
    const queued = pending.splice(0);
    queuedBytes = 0;
    for (const c of queued) {
      file.appendBuffer(withFileStart(c, fileStart));
      fileStart += c.byteLength;
    }
  }

  ms.addEventListener("sourceopen", () => {
    if (dead) return;
    const raw = isRawMseType(mime);
    if (raw) void openRaw(raw);
    else if (isMp4Like(mime, opts.name)) void openMp4();
    else void openRaw(mime);
  });

  return {
    url,
    async append(chunk: Uint8Array) {
      if (dead) return "low";
      const copy = chunk.slice();
      if (mp4) {
        mp4.appendBuffer(withFileStart(copy, fileStart));
        fileStart += copy.byteLength;
      } else if (sb) {
        await appendRaw(copy);
      } else {
        pending.push(copy);
        queuedBytes += copy.byteLength;
      }
      return pressureOf(liveBytes(), highBytes, lowBytes);
    },
    async evictUntil(seconds: number) {
      if (dead || !sb || sb.buffered.length === 0) {
        return pressureOf(liveBytes(), highBytes, lowBytes);
      }
      await waitUpdate();
      const start = sb.buffered.start(0);
      const cut = Math.max(start, seconds - 2);
      if (cut > start + 0.4) {
        try {
          sb.remove(start, cut);
          appended = Math.floor(appended * 0.7);
          await waitUpdate();
        } catch {
          /* ignore */
        }
      }
      return pressureOf(liveBytes(), highBytes, lowBytes);
    },
    end() {
      void updating.then(() => {
        mp4?.flush();
        if (ms.readyState === "open") {
          try {
            ms.endOfStream();
          } catch {
            /* ignore */
          }
        }
      });
    },
    destroy() {
      dead = true;
      pending.length = 0;
      queuedBytes = 0;
      try {
        if (ms.readyState === "open") ms.endOfStream();
      } catch {
        /* ignore */
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    },
    bufferedBytes() {
      return liveBytes();
    },
  };
}

export function createRoomPlaySink(opts: PlaySinkOpts = {}): RoomPlaySink {
  const MediaSrc = (
    globalThis as unknown as { MediaSource?: typeof MediaSource }
  ).MediaSource;
  if (typeof MediaSrc === "function") return createMsePlaySink(opts);
  return createPlayByteWindow(opts);
}
