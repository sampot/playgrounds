/**
 * In-process / SW-side buffer for 包廂遠端私下播.
 * Holds original DC bytes (soft cap) and serves them as a media Response body.
 * Not Cache Storage; not a page-level whole-file Blob.
 */

export const SESSION_FILE_PLAY_BUFFER_MAX = 32 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_HIGH = 24 * 1024 * 1024;
export const SESSION_FILE_PLAY_BUFFER_LOW = 8 * 1024 * 1024;
/** Keep the start of the file when sliding the play window. */
export const SESSION_FILE_PLAY_HEAD_KEEP = 2 * 1024 * 1024;
/** Same-file HTTP Ranges in flight (browser may open two connections). */
export const SESSION_FILE_PLAY_MAX_INFLIGHT = 2;
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

export type PlayPressure = "ok" | "high" | "low";

export const ROOM_PLAY_PATH_PREFIX = "/room-play/";
export const ROOM_PLAY_MSG = "go-room-play";

export type ByteRange = { start: number; end: number };

export type RoomPlayOpenOpts = {
  mime?: string;
  size?: number;
  maxBytes?: number;
  highBytes?: number;
  lowBytes?: number;
  headBytes?: number;
};

type Session = {
  mime: string;
  size: number;
  maxBytes: number;
  highBytes: number;
  lowBytes: number;
  headBytes: number;
  spans: { start: number; bytes: Uint8Array }[];
  appendAt: number;
  /** Active HTTP stream read cursors — trim must not drop unread bytes before these. */
  pins: Map<string, number>;
  ended: boolean;
  aborted: boolean;
  waiters: Array<() => void>;
};

function trimPlaySpans(s: Session): void {
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
  const pinList =
    s.pins.size > 0 ? [...s.pins.values()].sort((a, b) => a - b) : [0];
  const share = Math.max(1, Math.floor(s.maxBytes / pinList.length));
  const end = at + len;
  for (const pin of pinList) {
    const from = Math.max(0, pin);
    const to = from + share;
    if (at < to && end > from) return true;
  }
  return false;
}

function pressureOf(bytes: number, high: number, low: number): PlayPressure {
  if (bytes >= high) return "high";
  if (bytes <= low) return "low";
  return "ok";
}

export function roomPlayPath(id: string): string {
  return `${ROOM_PLAY_PATH_PREFIX}${encodeURIComponent(id)}`;
}

export function parseRoomPlayPath(pathname: string): string | null {
  if (!pathname.startsWith(ROOM_PLAY_PATH_PREFIX)) return null;
  const raw = pathname.slice(ROOM_PLAY_PATH_PREFIX.length);
  if (!raw || raw.includes("/")) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
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
  const end = b === "" ? size - 1 : Number(b);
  if (!Number.isFinite(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

/** Unranged GET with a known size → bytes=0-(size-1) so we can answer with 206. */
export function playFetchRange(
  rangeHeader: string | null | undefined,
  size: number
): ByteRange | null {
  const parsed = parseByteRange(rangeHeader, size);
  if (parsed) return parsed;
  if (size > 0) return { start: 0, end: size - 1 };
  return null;
}

function putFileSpan(
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
    if (s.start > lastEnd) {
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
  push(id: string, chunk: Uint8Array, at?: number): PlayPressure;
  end(id: string): void;
  abort(id: string): void;
  /** Advance a named HTTP stream read cursor (bytes before `at` may be trimmed). */
  pin(id: string, streamKey: string, at: number): void;
  unpin(id: string, streamKey: string): void;
  covers(id: string, start: number, end: number): boolean;
  read(id: string, start: number, end: number): Uint8Array | null;
  peek(id: string, start: number, max: number): Uint8Array;
  meta(id: string): { mime: string; size: number; received: number; ended: boolean } | null;
  liveBody(id: string): ReadableStream<Uint8Array>;
  rangeBody(id: string, range: ByteRange): Promise<ReadableStream<Uint8Array>>;
  bufferedBytes(id: string): number;
};

export function createRoomPlayRegistry(): RoomPlayRegistry {
  const sessions = new Map<string, Session>();

  function get(id: string): Session | undefined {
    return sessions.get(id);
  }

  function wake(s: Session): void {
    const waiters = s.waiters.splice(0);
    for (const w of waiters) w();
  }

  function wait(s: Session): Promise<void> {
    return new Promise((resolve) => {
      s.waiters.push(resolve);
    });
  }

  return {
    open(id, opts = {}) {
      const prev = sessions.get(id);
      if (prev) {
        prev.aborted = true;
        wake(prev);
      }
      sessions.set(id, {
        mime: opts.mime || "video/mp4",
        size: opts.size ?? 0,
        maxBytes: opts.maxBytes ?? SESSION_FILE_PLAY_BUFFER_MAX,
        highBytes: opts.highBytes ?? SESSION_FILE_PLAY_BUFFER_HIGH,
        lowBytes: opts.lowBytes ?? SESSION_FILE_PLAY_BUFFER_LOW,
        headBytes: opts.headBytes ?? SESSION_FILE_PLAY_HEAD_KEEP,
        spans: [],
        appendAt: 0,
        pins: new Map(),
        ended: false,
        aborted: false,
        waiters: [],
      });
    },
    push(id, chunk, at) {
      const s = get(id);
      if (!s || s.aborted) return "low";
      const pos = at ?? s.appendAt;
      if (!chunkOverlapsPinWindow(s, pos, chunk.byteLength)) {
        return "high";
      }
      s.spans = putFileSpan(s.spans, pos, chunk);
      s.appendAt = pos + chunk.byteLength;
      trimPlaySpans(s);
      wake(s);
      return pressureOf(spansStoredBytes(s.spans), s.highBytes, s.lowBytes);
    },
    end(id) {
      const s = get(id);
      if (!s) return;
      s.ended = true;
      wake(s);
    },
    abort(id) {
      const s = get(id);
      if (!s) return;
      s.aborted = true;
      s.spans = [];
      wake(s);
      sessions.delete(id);
    },
    pin(id, streamKey, at) {
      const s = get(id);
      if (!s || s.aborted) return;
      const pos = Math.max(0, Math.floor(at));
      s.pins.set(streamKey, pos);
      trimPlaySpans(s);
      wake(s);
    },
    unpin(id, streamKey) {
      const s = get(id);
      if (!s) return;
      s.pins.delete(streamKey);
      trimPlaySpans(s);
      wake(s);
    },
    covers(id, start, end) {
      const s = get(id);
      if (!s) return false;
      return fileSpansCover(s.spans, start, end);
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
            controller.enqueue(piece);
            return;
          }
          controller.close();
        },
        cancel() {
          const s = get(id);
          if (!s) return;
          s.pins.delete(streamKey);
          trimPlaySpans(s);
        },
      });
    },
    async rangeBody(id, range) {
      const limit = range.end + 1;
      let sent = range.start;
      const streamKey = `range-${range.start}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const s0 = get(id);
      if (s0) {
        s0.pins.set(streamKey, sent);
        trimPlaySpans(s0);
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
              controller.enqueue(piece);
              return;
            }
            if (s.ended) {
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
        },
      });
    },
    bufferedBytes(id) {
      const s = get(id);
      return s ? spansStoredBytes(s.spans) : 0;
    },
  };
}

export const defaultRoomPlaySessions = createRoomPlayRegistry();

