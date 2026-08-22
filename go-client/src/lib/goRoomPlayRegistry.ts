/**
 * In-process / SW-side buffer for 包廂遠端檔（下載／檢視／私下播）.
 * Holds original DC bytes (soft cap) and serves them as a standard HTTP Response body.
 * Not Cache Storage; not a page-level whole-file Blob.
 */

export const SESSION_FILE_PLAY_BUFFER_MAX = 32 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_HIGH = 24 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_LOW = 8 * 1024 * 1024;
/** Keep the start of the file when sliding the play window. */
export const SESSION_FILE_PLAY_HEAD_KEEP = 2 * 1024 * 1024;
/** Granularity for SW → page `need` while waiting on a hole. */
export const SESSION_FILE_PLAY_RANGE_SLICE = 512 * 1024;
/**
 * How far ahead of an active transfer's frontier the SW may ask before we open
 * another Range. Must be >> RANGE_SLICE (avoid need thrash) but << file size
 * (so a mid-file HTTP Range is not stuck waiting on offset 0).
 */
export const SESSION_FILE_PLAY_SEEK_SLACK = 2 * 1024 * 1024;
/** Ignore duplicate far-seek opens within this window. */
export const SESSION_FILE_PLAY_SEEK_DEBOUNCE_MS = 400;
/**
 * Safari／WebKit AVFoundation cannot play a Service Worker ReadableStream.
 * Each media Range is answered as a complete Blob, capped so we do not buffer
 * a whole-file Range into RAM (Safari then issues the next Range).
 */
export const SESSION_FILE_PLAY_MEDIA_BLOB_MAX = 2 * 1024 * 1024;

export type PlayPressure = "ok" | "high" | "low";

/** Canonical same-origin file URL (download／preview／play). */
export const ROOM_FILE_PATH_PREFIX = "/room-file/";
/** Legacy alias; parse still accepts it. */
export const ROOM_PLAY_PATH_PREFIX = "/room-play/";
export const ROOM_PLAY_MSG = "go-room-play";

export type ByteRange = { start: number; end: number };

export type RoomPlayBufferMode = "play" | "save";

export type RoomPlayOpenOpts = {
  mime?: string;
  size?: number;
  maxBytes?: number;
  highBytes?: number;
  lowBytes?: number;
  headBytes?: number;
  /**
   * `save` = stream-through download: only drop bytes already read (before pin);
   * never clip unread ahead (that caused Safari「檔案不完整」).
   * `play` = sliding seek windows (default).
   */
  mode?: RoomPlayBufferMode;
};

type Session = {
  mime: string;
  size: number;
  maxBytes: number;
  highBytes: number;
  lowBytes: number;
  headBytes: number;
  mode: RoomPlayBufferMode;
  spans: { start: number; bytes: Uint8Array }[];
  appendAt: number;
  /** Active HTTP stream read cursors — trim must not drop unread bytes before these. */
  pins: Map<string, number>;
  ended: boolean;
  aborted: boolean;
  /** waitSpace — woken by successful push／pin／abort. */
  waiters: Array<() => void>;
  /** waitPin — woken only by pin／unpin／abort／interrupt (not by other-offset push). */
  pinWaiters: Array<{
    resolve: () => void;
    at?: number;
    len?: number;
  }>;
};

function minPinOf(s: Session): number {
  if (s.pins.size === 0) return 0;
  let min = Infinity;
  for (const p of s.pins.values()) min = Math.min(min, p);
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

/** Drop only bytes strictly before the HTTP read pin (save stream-through). */
function trimSaveSpans(s: Session): void {
  const minPin = minPinOf(s);
  if (minPin <= 0) return;
  const clipped: { start: number; bytes: Uint8Array }[] = [];
  for (const span of s.spans) {
    const end = span.start + span.bytes.byteLength;
    if (end <= minPin) continue;
    if (span.start < minPin) {
      /** slice() so the consumed prefix ArrayBuffer can be GC'd. */
      clipped.push({
        start: minPin,
        bytes: span.bytes.slice(minPin - span.start),
      });
    } else {
      clipped.push(span);
    }
  }
  s.spans = clipped;
}

function trimPlaySpans(s: Session): void {
  if (s.mode === "save") {
    trimSaveSpans(s);
    return;
  }
  const maxBytes = s.maxBytes;
  if (maxBytes <= 0) {
    s.spans = [];
    return;
  }
  const pinList =
    s.pins.size > 0 ? [...s.pins.values()].sort((a, b) => a - b) : [0];
  const share = Math.max(1, Math.floor(maxBytes / pinList.length));
  const clipped: { start: number; bytes: Uint8Array }[] = [];
  for (const pin of pinList) {
    const from = Math.max(0, pin);
    const to = from + share;
    for (const span of s.spans) {
      const end = span.start + span.bytes.byteLength;
      const a = Math.max(span.start, from);
      const b = Math.min(end, to);
      if (b <= a) continue;
      clipped.push({
        start: a,
        bytes: span.bytes.subarray(a - span.start, b - span.start),
      });
    }
  }
  s.spans = clipped.reduce(
    (acc, sp) => putFileSpan(acc, sp.start, sp.bytes),
    [] as { start: number; bytes: Uint8Array }[]
  );
  while (spansStoredBytes(s.spans) > maxBytes && s.spans.length > 0) {
    const last = s.spans[s.spans.length - 1]!;
    const overflow = spansStoredBytes(s.spans) - maxBytes;
    if (overflow >= last.bytes.byteLength) {
      s.spans.pop();
      continue;
    }
    s.spans[s.spans.length - 1] = {
      start: last.start,
      bytes: last.bytes.subarray(0, last.bytes.byteLength - overflow),
    };
  }
}

function chunkOverlapsPinWindow(
  s: Session,
  at: number,
  len: number
): boolean {
  if (len <= 0) return false;
  const end = at + len;
  if (s.mode === "save") {
    const minPin = minPinOf(s);
    if (end <= minPin) return false;
    if (at >= minPin + s.maxBytes) return false;
    return true;
  }
  const pinList =
    s.pins.size > 0 ? [...s.pins.values()].sort((a, b) => a - b) : [0];
  const share = Math.max(1, Math.floor(s.maxBytes / pinList.length));
  for (const pin of pinList) {
    const from = Math.max(0, pin);
    const to = from + share;
    if (at < to && end > from) return true;
  }
  return false;
}

function bytesStoredAfterPin(
  spans: { start: number; bytes: Uint8Array }[],
  minPin: number
): number {
  let stored = 0;
  for (const span of spans) {
    const sEnd = span.start + span.bytes.byteLength;
    if (sEnd <= minPin) continue;
    stored += span.start < minPin ? sEnd - minPin : span.bytes.byteLength;
  }
  return stored;
}

/** Bytes of [from, to) not already covered by spans (no allocation). */
function uncoveredLength(
  spans: { start: number; bytes: Uint8Array }[],
  from: number,
  to: number
): number {
  if (to <= from) return 0;
  let need = from;
  let add = 0;
  for (const span of spans) {
    const sEnd = span.start + span.bytes.byteLength;
    if (sEnd <= need) continue;
    if (span.start > need) {
      add += Math.min(to, span.start) - need;
      need = Math.min(to, span.start);
    }
    need = Math.max(need, Math.min(to, sEnd));
    if (need >= to) return add;
  }
  if (need < to) add += to - need;
  return add;
}

/** Save: refuse if storing would exceed max after dropping the consumed prefix. */
function saveChunkFitsBudget(
  s: Session,
  at: number,
  chunk: Uint8Array
): boolean {
  const minPin = minPinOf(s);
  const end = at + chunk.byteLength;
  if (end <= minPin) return true;
  const stored = bytesStoredAfterPin(s.spans, minPin);
  const add = uncoveredLength(s.spans, Math.max(at, minPin), end);
  return stored + add <= s.maxBytes;
}

function pressureOf(bytes: number, high: number, low: number): PlayPressure {
  if (bytes >= high) return "high";
  if (bytes <= low) return "low";
  return "ok";
}

export type RoomFilePurpose = "play" | "save";

export function roomFilePath(
  id: string,
  opts?: { purpose?: RoomFilePurpose }
): string {
  const base = `${ROOM_FILE_PATH_PREFIX}${encodeURIComponent(id)}`;
  if (opts?.purpose === "play" || opts?.purpose === "save") {
    return `${base}?purpose=${opts.purpose}`;
  }
  return base;
}

/**
 * Download fetch URL. Page tells SW `?purpose=save` for task priority — **not**
 * Content-Disposition／`?download=`（WebKit download manager bypasses SW）.
 */
export function roomFileDownloadPath(id: string): string {
  return roomFilePath(id, { purpose: "save" });
}

/** @deprecated Prefer roomFilePath(id, { purpose: "play" }). */
export function roomPlayPath(id: string): string {
  return roomFilePath(id, { purpose: "play" });
}

/** Parse Page-supplied `?purpose=` from a search string or URL (SW／tests). */
export function parseRoomFilePurpose(
  searchOrUrl: string | URLSearchParams | null | undefined
): RoomFilePurpose | undefined {
  if (!searchOrUrl) return undefined;
  let params: URLSearchParams;
  if (searchOrUrl instanceof URLSearchParams) {
    params = searchOrUrl;
  } else {
    const s = String(searchOrUrl);
    try {
      if (s.includes("://") || s.startsWith("/")) {
        params = new URL(s, "http://go.local").searchParams;
      } else {
        params = new URLSearchParams(
          s.startsWith("?") ? s.slice(1) : s
        );
      }
    } catch {
      return undefined;
    }
  }
  const p = params.get("purpose");
  if (p === "play" || p === "save") return p;
  return undefined;
}

function idFromPrefixedPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length);
  if (!raw || raw.includes("/")) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export function parseRoomFilePath(pathname: string): string | null {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return (
    idFromPrefixedPath(pathOnly, ROOM_FILE_PATH_PREFIX) ??
    idFromPrefixedPath(pathOnly, ROOM_PLAY_PATH_PREFIX)
  );
}

/** @deprecated Prefer parseRoomFilePath — accepts /room-file/ and /room-play/. */
export function parseRoomPlayPath(pathname: string): string | null {
  return parseRoomFilePath(pathname);
}

export function parseByteRange(
  header: string | null | undefined,
  size: number
): ByteRange | null {
  if (!header || size <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return null;
  const a = m[1];
  const b = m[2];
  if (a === "" && b === "") return null;
  if (a === "") {
    const suffix = Number(b);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isFinite(start) || start < 0) return null;
  if (start >= size) return null;
  const end = b === "" ? size - 1 : Number(b);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/** True when the client sent a `bytes=` Range unit (even if unsatisfiable). */
export function isBytesRangeHeader(
  header: string | null | undefined
): boolean {
  return Boolean(header && /^bytes=/i.test(String(header).trim()));
}

/** Explicit Range only. Unranged GET → null (200 + live body + Content-Length). */
export function playFetchRange(
  rangeHeader: string | null | undefined,
  size: number
): ByteRange | null {
  return parseByteRange(rangeHeader, size);
}

export function roomFileMethodAllowed(method: string): boolean {
  const m = method.toUpperCase();
  return m === "GET" || m === "HEAD";
}

const MEDIA_EXT_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

function extOfName(name: string): string {
  const base = name.split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  if (i <= 0) return "";
  return base.slice(i + 1).toLowerCase();
}

/** HTTP Content-Type for /room-file. Safari will not play octet-stream as video. */
export function roomFileContentType(mime?: string, name?: string): string {
  const t = (mime ?? "").trim().toLowerCase();
  if (t && t !== "application/octet-stream") return t;
  const inferred = MEDIA_EXT_MIME[extOfName(name ?? "")];
  return inferred || t || "application/octet-stream";
}

export function isMediaContentType(mime: string): boolean {
  const t = mime.toLowerCase();
  return t.startsWith("video/") || t.startsWith("audio/");
}

/** Safari／WebKit media engine (not Chromium, which also contains "Safari" in UA). */
export function isWebKitMediaEngine(ua: string): boolean {
  const s = ua || "";
  if (/Chrome|Chromium|Edg\/|Android/i.test(s)) return false;
  return /Safari/i.test(s) || /AppleWebKit/i.test(s);
}

export function mediaRangeForBufferedBody(
  range: ByteRange | null,
  size: number,
  maxBytes = SESSION_FILE_PLAY_MEDIA_BLOB_MAX
): ByteRange {
  const cap = Math.max(1, maxBytes);
  if (range) {
    return {
      start: range.start,
      end: Math.min(range.end, range.start + cap - 1, Math.max(0, size - 1)),
    };
  }
  return { start: 0, end: Math.min(Math.max(0, size - 1), cap - 1) };
}

/**
 * HTTP Range the SW should serve for `/room-file` media.
 * Play always slices (Safari blob-media *and* Chromium stream) so one seek
 * does not pin the DC to EOF — that is what made Edge scrub stall.
 * Save keeps the client Range／full body (stream-through download).
 */
export function roomFileServeByteRange(opts: {
  range: ByteRange | null;
  size: number;
  purpose?: "play" | "save";
  bodyKind: RoomFileHttpBodyKind;
}): ByteRange | null {
  const sizeHint =
    opts.size > 0 ? opts.size : opts.range ? opts.range.end + 1 : 0;
  if (opts.bodyKind === "blob-media" || opts.purpose === "play") {
    return mediaRangeForBufferedBody(opts.range, sizeHint);
  }
  return opts.range;
}

export type RoomFileHttpBodyKind = "blob-local" | "blob-media" | "stream";

export function roomFileHttpBodyKind(opts: {
  ua: string;
  mime: string;
  local: boolean;
  destination?: string;
  hasRange?: boolean;
}): RoomFileHttpBodyKind {
  if (opts.local) return "blob-local";
  if (!isMediaContentType(opts.mime) || !isWebKitMediaEngine(opts.ua)) {
    return "stream";
  }
  const dest = (opts.destination || "").toLowerCase();
  if (dest === "video" || dest === "audio" || dest === "track") {
    return "blob-media";
  }
  /** Safari <video> always Range; page fetch() download must keep the live 200. */
  if (opts.hasRange) return "blob-media";
  return "stream";
}

/** File.slice is a view (not a RAM copy). Safari plays Blob SW bodies; not streams. */
export function localFileSlice(
  file: Blob,
  start: number,
  endExclusive: number,
  name?: string
): Blob {
  const fileName = name ?? (file instanceof File ? file.name : "");
  const type = roomFileContentType(file.type, fileName);
  const from = Math.max(0, start);
  const to = Math.max(from, endExclusive);
  return file.slice(from, to, type);
}

/**
 * Insert a chunk into the span list.
 * Adjacent chunks stay separate — merging into one Uint8Array is O(n²) copies
 * and freezes Chromium mid-download on large saves (~32 MiB window × many chunks).
 * True overlaps still merge (rare retransmit／seek).
 */
export function putFileSpan(
  spans: { start: number; bytes: Uint8Array }[],
  start: number,
  chunk: Uint8Array
): { start: number; bytes: Uint8Array }[] {
  if (!chunk.byteLength) return spans;
  const incoming = { start, bytes: chunk.slice() };
  const all = [...spans, incoming].sort((a, b) => a.start - b.start);
  const out: { start: number; bytes: Uint8Array }[] = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (!last) {
      out.push(s);
      continue;
    }
    const lastEnd = last.start + last.bytes.byteLength;
    const sEnd = s.start + s.bytes.byteLength;
    if (s.start >= lastEnd) {
      /** Gap or adjacent — keep as its own entry (no giant merge copy). */
      out.push(s);
      continue;
    }
    const newEnd = Math.max(lastEnd, sEnd);
    const merged = new Uint8Array(newEnd - last.start);
    merged.set(last.bytes, 0);
    merged.set(s.bytes, s.start - last.start);
    out[out.length - 1] = { start: last.start, bytes: merged };
  }
  return out;
}

function spansStoredBytes(spans: { start: number; bytes: Uint8Array }[]): number {
  return spans.reduce((n, s) => n + s.bytes.byteLength, 0);
}

export function fileSpansCover(
  spans: { start: number; bytes: Uint8Array }[],
  start: number,
  end: number
): boolean {
  if (end <= start) return true;
  let need = start;
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= need) continue;
    if (s.start > need) return false;
    need = sEnd;
    if (need >= end) return true;
  }
  return need >= end;
}

function contiguousEnd(
  spans: { start: number; bytes: Uint8Array }[],
  start: number
): number {
  let need = start;
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= need) continue;
    if (s.start > need) break;
    need = sEnd;
  }
  return need;
}

function sliceFileSpans(
  spans: { start: number; bytes: Uint8Array }[],
  start: number,
  end: number
): Uint8Array {
  const len = Math.max(0, end - start);
  const out = new Uint8Array(len);
  for (const s of spans) {
    const sEnd = s.start + s.bytes.byteLength;
    if (sEnd <= start || s.start >= end) continue;
    const from = Math.max(start, s.start);
    const to = Math.min(end, sEnd);
    out.set(s.bytes.subarray(from - s.start, to - s.start), from - start);
  }
  return out;
}

export type RoomPlayRegistry = {
  open(id: string, opts?: RoomPlayOpenOpts): void;
  /** Own shared File — HTTP served locally; no DC transfer. */
  registerLocal(id: string, file: File): void;
  unregisterLocal(id: string): void;
  hasLocal(id: string): boolean;
  push(id: string, chunk: Uint8Array, at?: number): PlayPressure;
  /** Resolve when pin／trim may allow a previously-rejected chunk. */
  waitSpace(id: string): Promise<void>;
  /**
   * Resolve when the pin set may allow storing at `at` (or on interrupt／abort).
   * Unrelated pin crawls must not busy-wake far waiters (Edge main-thread freeze).
   */
  waitPin(id: string, at?: number, len?: number): Promise<void>;
  /** Wake all waitSpace／waitPin waiters (dropped Range／interrupt in-flight append). */
  wakeWaiters(id: string): void;
  end(id: string): void;
  abort(id: string): void;
  /** Advance a named HTTP stream read cursor (bytes before `at` may be trimmed). */
  pin(id: string, streamKey: string, at: number): void;
  unpin(id: string, streamKey: string): void;
  covers(id: string, start: number, end: number): boolean;
  /** True if [at, at+len) overlaps any active HTTP pin window (may still be full). */
  inPinWindow(id: string, at: number, len: number): boolean;
  read(id: string, start: number, end: number): Uint8Array | null;
  peek(id: string, start: number, max: number): Uint8Array;
  meta(id: string): { mime: string; size: number; received: number; ended: boolean } | null;
  liveBody(id: string): ReadableStream<Uint8Array>;
  rangeBody(id: string, range: ByteRange): Promise<ReadableStream<Uint8Array>>;
  bufferedBytes(id: string): number;
};

export function createRoomPlayRegistry(): RoomPlayRegistry {
  const sessions = new Map<string, Session>();
  const localFiles = new Map<string, File>();

  function get(id: string): Session | undefined {
    return sessions.get(id);
  }

  function wake(s: Session): void {
    const waiters = s.waiters.splice(0);
    for (const w of waiters) w();
  }

  function wakePin(s: Session, mode: "all" | "progress" = "progress"): void {
    if (mode === "all") {
      const pinWaiters = s.pinWaiters.splice(0);
      for (const w of pinWaiters) w.resolve();
      wake(s);
      return;
    }
    const remain: typeof s.pinWaiters = [];
    for (const w of s.pinWaiters) {
      if (
        w.at == null ||
        chunkOverlapsPinWindow(s, w.at, Math.max(1, w.len ?? 1))
      ) {
        w.resolve();
      } else {
        remain.push(w);
      }
    }
    s.pinWaiters = remain;
    wake(s);
  }

  function wait(s: Session): Promise<void> {
    return new Promise((resolve) => {
      s.waiters.push(resolve);
    });
  }

  function waitForPin(
    s: Session,
    at?: number,
    len?: number
  ): Promise<void> {
    if (
      at != null &&
      chunkOverlapsPinWindow(s, at, Math.max(1, len ?? 1))
    ) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      s.pinWaiters.push({ resolve, at, len });
    });
  }

  function localMeta(id: string) {
    const file = localFiles.get(id);
    if (!file) return null;
    return {
      mime: roomFileContentType(file.type, file.name),
      size: file.size,
      received: file.size,
      ended: true,
    };
  }

  function streamLocalFile(
    file: File,
    start: number,
    endExclusive: number
  ): ReadableStream<Uint8Array> {
    const chunk = SESSION_FILE_PLAY_RANGE_SLICE;
    let offset = Math.max(0, start);
    const limit = Math.min(file.size, endExclusive);
    return new ReadableStream({
      async pull(controller) {
        if (offset >= limit) {
          controller.close();
          return;
        }
        const end = Math.min(offset + chunk, limit);
        const buf = new Uint8Array(await file.slice(offset, end).arrayBuffer());
        offset = end;
        if (buf.byteLength) controller.enqueue(buf);
        if (offset >= limit) controller.close();
      },
    });
  }

  return {
    open(id, opts = {}) {
      const prev = sessions.get(id);
      if (prev) {
        prev.aborted = true;
        wakePin(prev, "all");
      }
      sessions.set(id, {
        mime: opts.mime || "video/mp4",
        size: opts.size ?? 0,
        maxBytes: opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX,
        highBytes: opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH,
        lowBytes: opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW,
        headBytes: opts.headBytes ?? SESSION_FILE_PLAY_HEAD_KEEP,
        mode: opts.mode === "save" ? "save" : "play",
        spans: [],
        appendAt: 0,
        pins: new Map(),
        ended: false,
        aborted: false,
        waiters: [],
        pinWaiters: [],
      });
    },
    registerLocal(id, file) {
      localFiles.set(id, file);
      const prev = sessions.get(id);
      if (prev) {
        prev.aborted = true;
        wakePin(prev, "all");
        sessions.delete(id);
      }
    },
    unregisterLocal(id) {
      localFiles.delete(id);
    },
    hasLocal(id) {
      return localFiles.has(id);
    },
    push(id, chunk, at) {
      if (localFiles.has(id)) return "low";
      const s = get(id);
      if (!s || s.aborted) return "low";
      const pos = at ?? s.appendAt;
      if (!chunkOverlapsPinWindow(s, pos, chunk.byteLength)) {
        return "high";
      }
      if (s.mode === "save" && !saveChunkFitsBudget(s, pos, chunk)) {
        return "high";
      }
      s.spans = putFileSpan(s.spans, pos, chunk);
      s.appendAt = pos + chunk.byteLength;
      trimPlaySpans(s);
      wake(s);
      return pressureOf(spansStoredBytes(s.spans), s.highBytes, s.lowBytes);
    },
    waitSpace(id) {
      const s = get(id);
      if (!s || s.aborted || s.ended) return Promise.resolve();
      return wait(s);
    },
    waitPin(id, at, len) {
      const s = get(id);
      if (!s || s.aborted || s.ended) return Promise.resolve();
      return waitForPin(s, at, len);
    },
    wakeWaiters(id) {
      const s = get(id);
      if (!s) return;
      wakePin(s, "all");
    },
    end(id) {
      const s = get(id);
      if (!s) return;
      s.ended = true;
      wakePin(s, "all");
    },
    abort(id) {
      const s = get(id);
      if (!s) return;
      s.aborted = true;
      s.spans = [];
      wakePin(s, "all");
      sessions.delete(id);
    },
    pin(id, streamKey, at) {
      const s = get(id);
      if (!s || s.aborted) return;
      const pos = Math.max(0, Math.floor(at));
      s.pins.set(streamKey, pos);
      trimPlaySpans(s);
      wakePin(s);
    },
    unpin(id, streamKey) {
      const s = get(id);
      if (!s) return;
      s.pins.delete(streamKey);
      trimPlaySpans(s);
      wakePin(s);
    },
    covers(id, start, end) {
      const file = localFiles.get(id);
      if (file) return start >= 0 && end <= file.size && end >= start;
      const s = get(id);
      if (!s) return false;
      return fileSpansCover(s.spans, start, end);
    },
    inPinWindow(id, at, len) {
      if (localFiles.has(id)) return true;
      const s = get(id);
      if (!s || s.aborted) return false;
      return chunkOverlapsPinWindow(s, at, len);
    },
    read(id, start, end) {
      const s = get(id);
      if (!s || !fileSpansCover(s.spans, start, end)) return null;
      return sliceFileSpans(s.spans, start, end);
    },
    peek(id, start, max) {
      const s = get(id);
      if (!s || max <= 0) return new Uint8Array(0);
      const to = Math.min(start + max, contiguousEnd(s.spans, start));
      if (to <= start) return new Uint8Array(0);
      return sliceFileSpans(s.spans, start, to);
    },
    meta(id) {
      const local = localMeta(id);
      if (local) return local;
      const s = get(id);
      if (!s) return null;
      return {
        mime: s.mime,
        size: s.size,
        received: spansStoredBytes(s.spans),
        ended: s.ended,
      };
    },
    liveBody(id) {
      const file = localFiles.get(id);
      if (file) return streamLocalFile(file, 0, file.size);
      const s0 = get(id);
      if (!s0) {
        return new ReadableStream({
          start(c) {
            c.close();
          },
        });
      }
      const streamKey = `live-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      let sent = 0;
      s0.pins.set(streamKey, sent);
      wakePin(s0);
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          const s = get(id);
          if (!s || s.aborted) {
            controller.close();
            return;
          }
          let avail = contiguousEnd(s.spans, sent);
          while (avail <= sent && !s.ended && !s.aborted) {
            await wait(s);
            avail = contiguousEnd(s.spans, sent);
          }
          if (!sessions.has(id) || s.aborted) {
            controller.close();
            return;
          }
          avail = contiguousEnd(s.spans, sent);
          if (avail > sent) {
            const piece = sliceFileSpans(s.spans, sent, avail);
            sent += piece.byteLength;
            s.pins.set(streamKey, sent);
            trimPlaySpans(s);
            wakePin(s);
            controller.enqueue(piece);
            return;
          }
          /** Do not close short of declared size when ended with holes. */
          if (s.ended && sent < s.size && avail <= sent) {
            controller.error(new Error("檔案不完整"));
            return;
          }
          controller.close();
        },
        cancel() {
          const s = get(id);
          if (!s) return;
          s.pins.delete(streamKey);
          trimPlaySpans(s);
          wakePin(s);
        },
      });
    },
    async rangeBody(id, range) {
      const file = localFiles.get(id);
      if (file) {
        return streamLocalFile(file, range.start, range.end + 1);
      }
      const limit = range.end + 1;
      let sent = range.start;
      const streamKey = `range-${range.start}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const s0 = get(id);
      if (s0) {
        s0.pins.set(streamKey, sent);
        trimPlaySpans(s0);
        wakePin(s0);
      }
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sent >= limit) {
            controller.close();
            return;
          }
          for (;;) {
            const s = get(id);
            if (!s || s.aborted) {
              controller.close();
              return;
            }
            const avail = Math.min(limit, contiguousEnd(s.spans, sent));
            if (avail > sent) {
              const piece = sliceFileSpans(s.spans, sent, avail);
              sent += piece.byteLength;
              s.pins.set(streamKey, sent);
              trimPlaySpans(s);
              wakePin(s);
              controller.enqueue(piece);
              return;
            }
            if (s.ended) {
              if (sent < limit) {
                controller.error(new Error("檔案不完整"));
                return;
              }
              controller.close();
              return;
            }
            await wait(s);
          }
        },
        cancel() {
          const s = get(id);
          if (!s) return;
          s.pins.delete(streamKey);
          trimPlaySpans(s);
          wakePin(s);
        },
      });
    },
    bufferedBytes(id) {
      if (localFiles.has(id)) {
        return localFiles.get(id)?.size ?? 0;
      }
      const s = get(id);
      return s ? spansStoredBytes(s.spans) : 0;
    },
  };
}

export const defaultRoomPlaySessions = createRoomPlayRegistry();

