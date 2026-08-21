/**
 * Dev harness: Host 掛檔 ↔ Guest 只經 Service Worker `/room-file/<id>` 取檔。
 *
 * **與包廂產品同碼（硬）：**
 * - `createRoomFileTransfer`／`shareLocalFile`／`download`／`play`／`seekPlay`／`notePlayhead`／`attachPlaybackUrl`
 * - SW bridge：`listenRoomOpenTransfer`／`listenRoomTransferEnd`／`listenRoomPlaySaveCancel`
 * - URL：`roomFilePath` → 下載＝`download()`；預覽＝`play()`+`<img>`；私下播＝`play()`+`<video>`+Range
 *
 * **真實旅程：** ①預覽圖 ②下載文件 ③單路下載較大檔 ④私下播＋scrub ⑤隧道4×GET壓力
 *
 * **僅有的差異：** BroadcastChannel 信令；記憶體 writable；500 MB 影片＝sparse 虛擬 File
 */

import {
  isSessionFileControl,
  type SessionFileControl,
} from "@pg/roster/rosterSessionFile";
import {
  createRoomFileTransfer,
  type RoomFileEntry,
  type RoomFileTransfer,
  type RoomFileWritable,
} from "./goRoomFileTransfer";
import { attachPlaybackUrl } from "./goRoom";
import {
  ensureRoomFileSw,
  listenRoomOpenTransfer,
  listenRoomPlaySaveCancel,
  listenRoomTransferEnd,
  registerLocalRoomFile,
  unregisterLocalRoomFile,
} from "./goRoomPlayBridge";
import { ROOM_FILE_JOB_MAX_TASKS } from "./goRoomFileJobs";
import { roomFileDownloadPath, roomFilePath } from "./goRoomPlayRegistry";

export { roomFilePath };
export function createMemorySaveWritable(): {
  writable: RoomFileWritable;
  byteLength: () => number;
  bytes: () => Uint8Array;
} {
  const parts: Uint8Array[] = [];
  let closed = false;
  return {
    writable: {
      write: (data) => {
        if (closed) return;
        if (data instanceof Uint8Array) {
          parts.push(new Uint8Array(data));
          return;
        }
        if (data instanceof ArrayBuffer) {
          parts.push(new Uint8Array(data));
          return;
        }
        const view = data as ArrayBufferView;
        parts.push(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        );
      },
      close: () => {
        closed = true;
      },
      abort: () => {
        closed = true;
        parts.length = 0;
      },
    },
    byteLength: () => parts.reduce((n, p) => n + p.byteLength, 0),
    bytes: () => {
      const total = parts.reduce((n, p) => n + p.byteLength, 0);
      const out = new Uint8Array(total);
      let at = 0;
      for (const p of parts) {
        out.set(p, at);
        at += p.byteLength;
      }
      return out;
    },
  };
}

/**
 * Modules／APIs the harness must share with 包廂下載／預覽（static parity check）.
 */
export const ROOM_XFER_PRODUCT_APIS = [
  "createRoomFileTransfer",
  "download",
  "play",
  "seekPlay",
  "stopPlay",
  "notePlayhead",
  "acceptHttpTransfer",
  "noteHttpTransferEnd",
  "shareLocalFile",
  "roomFilePath",
  "attachPlaybackUrl",
  "listenRoomOpenTransfer",
  "listenRoomTransferEnd",
  "listenRoomPlaySaveCancel",
  "ensureRoomFileSw",
] as const;

export const ROOM_XFER_CHANNEL = "go-room-xfer-harness";
export const ROOM_XFER_CONCURRENT = 10;
export const ROOM_XFER_FILE_COUNT = 5;
/** Large scrub target（500 MiB）— sparse File, materialize only on slice. */
export const ROOM_XFER_MOVIE_SIZE = 500 * 1024 * 1024;
export const ROOM_XFER_MOVIE_SEED = 42;
export const ROOM_XFER_RANGE_SLICE = 256 * 1024;
/** Independent scrub test: how many random Range seeks. */
export const ROOM_XFER_SCRUB_SEEKS = 8;
/**
 * Host-side delay per File.slice().arrayBuffer() — simulates disk／flash I/O
 * so DC scheduling is exercised under non-instant reads.
 */
export const ROOM_XFER_IO_DELAY_MS = 25;
/**
 * Direct-DL sched stress fixture — large enough that 10 concurrent full-file
 * pumps exercise quantum scheduling + I/O delay (not a trivial 48 KiB race).
 */
export const ROOM_XFER_SCHED_SIZE = 1024 * 1024;
export const ROOM_XFER_SCHED_SEED = 99;
export const ROOM_XFER_SCHED_IO_DELAY_MS = 15;

/** Stable ids so guest can target the burst file without racing share order. */
export const ROOM_XFER_IDS = {
  burst: "xf-burst",
  image: "xf-image",
  note: "xf-note",
  movie: "xf-movie",
  /** Skip-SW concurrent download sched stress. */
  sched: "xf-sched",
} as const;

export type RoomXferRole = "host" | "guest";

export type RoomXferSignal =
  | { v: 1; type: "hello"; role: RoomXferRole; room: string }
  | {
      v: 1;
      type: "offer";
      room: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      v: 1;
      type: "answer";
      room: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      v: 1;
      type: "ice";
      room: string;
      role: RoomXferRole;
      candidate: RTCIceCandidateInit | null;
    };

export type RoomXferFetchResult = {
  index: number;
  ok: boolean;
  status: number;
  bytes: number;
  sha256?: string;
  error?: string;
  /** Inclusive Range when this was a Range GET. */
  range?: { start: number; end: number };
  contentRange?: string | null;
  label?: string;
};

export type RoomXferSeekStep = RoomXferFetchResult & {
  label: string;
  patternOk: boolean;
};

export type RoomXferImagePreview = {
  ok: boolean;
  url: string;
  error?: string;
};

export type RoomXferVideoPlay = {
  ok: boolean;
  /** Used product `attachPlaybackUrl` on a real `<video>`. */
  attached: boolean;
  dualProbeOk: boolean;
  seek: RoomXferSeekStep[];
  /**
   * `<video>` held HTTP slots so later Range／fetch failed
   * (`Failed to fetch`／status 0) — the bottleneck we want to surface.
   */
  connectionStarved: boolean;
  starvedLabels: string[];
  /** After clearing `<video>` src, a probe Range succeeds again. */
  recoveredAfterDetach: boolean;
  error?: string;
};

/** Independent large-video scrub（random seeks + host I/O delay）. */
export type RoomXferScrubReport = {
  ok: boolean;
  swControlled: boolean;
  playOk: boolean;
  url: string;
  ioDelayMs: number;
  seeks: RoomXferSeekStep[];
  /** Wall ms for all seeks（includes host I/O delay＋DC）. */
  elapsedMs: number;
  message: string;
};

/**
 * Skip SW／HTTP：直接 admit N 個 download tasks，壓測 DC concurrent 排程。
 * 完成用 `noteHttpTransferEnd` 模擬 SW transfer-complete。
 */
export type RoomXferDirectDlReport = {
  ok: boolean;
  taskCount: number;
  maxTasks: number;
  admitted: number;
  overflowRejected: boolean;
  completed: number;
  /** Sum of per-task received when all tasks full（expect ≈ size×admitted）. */
  bytesPumped: number;
  ioDelayMs: number;
  elapsedMs: number;
  message: string;
};

export type RoomXferStressReport = {
  ok: boolean;
  swControlled: boolean;
  filesListed: number;
  /** ① 預覽圖片（play + `<img src=playback.url>`） */
  imagePreview: RoomXferImagePreview | null;
  /** ② 下載文件（`download()` + writable） */
  downloadDoc: RoomXferFetchResult | null;
  /** ③ 下載較大二進位——單路 stream（真實下載，非多路並發） */
  downloadBinary: RoomXferFetchResult | null;
  /**
   * @deprecated Large-video scrub is `runVideoScrub()` — not part of stress.
   * Kept null for older report consumers.
   */
  videoPlay: RoomXferVideoPlay | null;
  /** ④ 隧道壓力：同檔 N×GET（≤ job max tasks） */
  tunnelStress: RoomXferFetchResult[];
  /** @deprecated alias downloadDoc */
  download: RoomXferFetchResult | null;
  /** @deprecated alias tunnelStress */
  concurrent: RoomXferFetchResult[];
  /** @deprecated */
  image: RoomXferFetchResult | null;
  /** @deprecated */
  note: RoomXferFetchResult | null;
  /** @deprecated */
  seek: RoomXferSeekStep[];
  previewOk: boolean;
  message: string;
};

export type RoomXferHarness = {
  role: RoomXferRole;
  start(): Promise<void>;
  dispose(): void;
  getState(): {
    phase: string;
    dcOpen: boolean;
    swReady: boolean;
    entries: RoomFileEntry[];
    lastReport: RoomXferStressReport | null;
    lastScrubReport: RoomXferScrubReport | null;
    lastDirectDlReport: RoomXferDirectDlReport | null;
    log: string[];
  };
  subscribe(listener: () => void): () => void;
  /** Guest: ①預覽 ②下載文件 ③單路下載 ④隧道 N×GET（不含大影片 scrub）. */
  runStress(): Promise<RoomXferStressReport>;
  /** Guest: 大影片預覽＋隨機快轉（host File I/O delay）. */
  runVideoScrub(): Promise<RoomXferScrubReport>;
  /**
   * Guest: 跳過 SW／fetch，直接 admit max-tasks 路 download，壓測 DC 排程；
   * 第 max+1 路必須 reject。
   */
  runDirectDownloadSched(): Promise<RoomXferDirectDlReport>;
  mountFixtures(): Promise<{ ok: boolean; error?: string }>;
};

export function patternByteAt(offset: number, seed: number): number {
  return (seed + offset * 7) & 0xff;
}

export function patternBytes(size: number, seed: number): Uint8Array {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    out[i] = patternByteAt(i, seed);
  }
  return out;
}

/** Absolute-offset pattern slice — used by sparse File.slice without allocating the whole movie. */
export function patternBytesRange(
  start: number,
  length: number,
  seed: number
): Uint8Array {
  const len = Math.max(0, Math.floor(length));
  const at = Math.max(0, Math.floor(start));
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = patternByteAt(at + i, seed);
  }
  return out;
}

/**
 * Claims `size` bytes but only generates pattern data when `.slice()` is read.
 * Needed for 500 MiB scrub fixtures (full allocation would OOM the harness tab).
 * Note: postMessage to SW clones a native Blob — local SW serve of this File is
 * not authoritative; remote guest path pumps via the page’s patched slice.
 */
export function createSparsePatternFile(opts: {
  name: string;
  size: number;
  seed: number;
  type: string;
  /** Delay each slice `arrayBuffer()` (simulates file I/O). */
  ioDelayMs?: number;
}): File {
  const { name, size, seed, type } = opts;
  const ioDelayMs = Math.max(0, Math.floor(opts.ioDelayMs ?? 0));
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", {
    configurable: true,
    enumerable: true,
    get: () => size,
  });
  Object.defineProperty(file, "slice", {
    configurable: true,
    writable: true,
    value(start = 0, end: number = size, contentType?: string) {
      const s = Math.max(0, Math.min(size, Math.floor(Number(start) || 0)));
      let e = end == null || end === undefined ? size : Math.floor(Number(end));
      if (!Number.isFinite(e)) e = size;
      e = Math.max(0, Math.min(size, e));
      if (e < s) e = s;
      const bytes = patternBytesRange(s, e - s, seed);
      const mime = contentType || type;
      if (ioDelayMs <= 0) {
        return new Blob([bytes], { type: mime });
      }
      /** File.slice is sync; delay lives on arrayBuffer (owner pump awaits it). */
      return {
        size: bytes.byteLength,
        type: mime,
        async arrayBuffer() {
          await new Promise<void>((r) => setTimeout(r, ioDelayMs));
          return bytes.slice().buffer;
        },
        async text() {
          await new Promise<void>((r) => setTimeout(r, ioDelayMs));
          return new TextDecoder().decode(bytes);
        },
        slice() {
          return new Blob([bytes], { type: mime });
        },
        stream() {
          return new Blob([bytes], { type: mime }).stream();
        },
      } as Blob;
    },
  });
  return file;
}

/** Verify a Range body matches the deterministic pattern at absolute offsets. */
export function verifyPatternRange(
  body: Uint8Array,
  start: number,
  seed: number
): boolean {
  if (body.byteLength === 0) return false;
  const last = body.byteLength - 1;
  const mid = body.byteLength >> 1;
  if (body[0] !== patternByteAt(start, seed)) return false;
  if (body[mid] !== patternByteAt(start + mid, seed)) return false;
  if (body[last] !== patternByteAt(start + last, seed)) return false;
  /** Spot-check a few more offsets (full scan is slow for large slices). */
  for (let i = 16; i < last; i += Math.max(64, (last / 8) | 0)) {
    if (body[i] !== patternByteAt(start + i, seed)) return false;
  }
  return true;
}

/** Tiny valid 1×1 PNG (68 bytes). */
export function tinyPngBytes(): Uint8Array {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    buf instanceof Uint8Array
      ? buf
      : new Uint8Array(buf);
  const copy =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? bytes
      : bytes.slice();
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function buildFixtureFiles(): {
  burst: File;
  image: File;
  note: File;
  movie: File;
  sched: File;
  expected: Record<string, { size: number }>;
} {
  const burst = new File([patternBytes(48 * 1024, 11)], "burst.bin", {
    type: "application/octet-stream",
  });
  const image = new File([tinyPngBytes()], "preview.png", {
    type: "image/png",
  });
  const note = new File(
    [new TextEncoder().encode("room-xfer note via /room-file/\n")],
    "note.txt",
    { type: "text/plain" }
  );
  /** Fake large video — sparse pattern File; Range seeks simulate scrubbing. */
  const movie = createSparsePatternFile({
    name: "scrub.mp4",
    size: ROOM_XFER_MOVIE_SIZE,
    seed: ROOM_XFER_MOVIE_SEED,
    type: "video/mp4",
    ioDelayMs: ROOM_XFER_IO_DELAY_MS,
  });
  /** Direct-DL concurrent sched stress — 1 MiB + per-slice I/O delay. */
  const sched = createSparsePatternFile({
    name: "sched.bin",
    size: ROOM_XFER_SCHED_SIZE,
    seed: ROOM_XFER_SCHED_SEED,
    type: "application/octet-stream",
    ioDelayMs: ROOM_XFER_SCHED_IO_DELAY_MS,
  });
  return {
    burst,
    image,
    note,
    movie,
    sched,
    expected: {
      [ROOM_XFER_IDS.burst]: { size: burst.size },
      [ROOM_XFER_IDS.image]: { size: image.size },
      [ROOM_XFER_IDS.note]: { size: note.size },
      [ROOM_XFER_IDS.movie]: { size: movie.size },
      [ROOM_XFER_IDS.sched]: { size: sched.size },
    },
  };
}

function parseSignal(data: unknown): RoomXferSignal | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.v !== 1 || typeof m.type !== "string") return null;
  return data as RoomXferSignal;
}

/**
 * Fetch must hit the SW controller — never invent blob:/object URL product paths.
 */
export async function fetchRoomFileViaSw(
  id: string,
  index: number,
  opts?: { range?: { start: number; end: number }; label?: string }
): Promise<RoomXferFetchResult> {
  const url = roomFileDownloadPath(id);
  const range = opts?.range;
  try {
    const headers: HeadersInit = {};
    if (range) {
      headers.Range = `bytes=${range.start}-${range.end}`;
    }
    const res = await fetch(url, { cache: "no-store", headers });
    if (!res.ok && res.status !== 206) {
      return {
        index,
        ok: false,
        status: res.status,
        bytes: 0,
        error: `HTTP ${res.status}`,
        range,
        label: opts?.label,
      };
    }
    if (range && res.status !== 206) {
      return {
        index,
        ok: false,
        status: res.status,
        bytes: 0,
        error: `expected 206 for Range, got ${res.status}`,
        range,
        contentRange: res.headers.get("Content-Range"),
        label: opts?.label,
      };
    }
    const buf = await res.arrayBuffer();
    const sha256 = await sha256Hex(buf);
    return {
      index,
      ok: true,
      status: res.status,
      bytes: buf.byteLength,
      sha256,
      range,
      contentRange: res.headers.get("Content-Range"),
      label: opts?.label,
    };
  } catch (e) {
    return {
      index,
      ok: false,
      status: 0,
      bytes: 0,
      error: e instanceof Error ? e.message : String(e),
      range,
      label: opts?.label,
    };
  }
}

/**
 * Range GET via SW + pattern check (simulates media seek / scrub).
 */
export async function fetchRoomFileRangeVerified(
  id: string,
  start: number,
  end: number,
  seed: number,
  label: string,
  index = 0
): Promise<RoomXferSeekStep> {
  const url = roomFilePath(id, { purpose: "play" });
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Range: `bytes=${start}-${end}` },
    });
    const contentRange = res.headers.get("Content-Range");
    if (res.status !== 206) {
      return {
        index,
        ok: false,
        status: res.status,
        bytes: 0,
        error: `expected 206, got ${res.status}`,
        range: { start, end },
        contentRange,
        label,
        patternOk: false,
      };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const expectLen = end - start + 1;
    const patternOk =
      buf.byteLength === expectLen && verifyPatternRange(buf, start, seed);
    const crOk =
      !contentRange ||
      contentRange.includes(`${start}-${end}/`) ||
      contentRange.includes(`${start}-${end}`);
    return {
      index,
      ok: patternOk && crOk,
      status: res.status,
      bytes: buf.byteLength,
      sha256: await sha256Hex(buf),
      range: { start, end },
      contentRange,
      label,
      patternOk,
      error:
        patternOk && crOk
          ? undefined
          : !patternOk
            ? "pattern mismatch or length"
            : `bad Content-Range: ${contentRange}`,
    };
  } catch (e) {
    return {
      index,
      ok: false,
      status: 0,
      bytes: 0,
      error: e instanceof Error ? e.message : String(e),
      range: { start, end },
      label,
      patternOk: false,
    };
  }
}

/** Media-like scrub plan on a 500 MiB file：頭→頭尾並發→前進→再前進→後退. */
export function movieSeekPlan(fileSize = ROOM_XFER_MOVIE_SIZE): {
  label: string;
  start: number;
  end: number;
}[] {
  const slice = ROOM_XFER_RANGE_SLICE;
  const last = fileSize - 1;
  const head = { label: "head", start: 0, end: slice - 1 };
  const tail = {
    label: "tail",
    start: fileSize - slice,
    end: last,
  };
  /** Jumps exceed SESSION_FILE_PLAY_SEEK_SLACK (2 MiB); spread across the 500 MiB body. */
  const mid = {
    label: "seek-mid",
    start: 200 * 1024 * 1024,
    end: 200 * 1024 * 1024 + slice - 1,
  };
  const forward = {
    label: "seek-forward",
    start: 400 * 1024 * 1024,
    end: 400 * 1024 * 1024 + slice - 1,
  };
  const back = {
    label: "seek-back",
    start: 50 * 1024 * 1024,
    end: 50 * 1024 * 1024 + slice - 1,
  };
  return [head, tail, mid, forward, back];
}

/** Mulberry32 — deterministic [0,1) for seeded scrub plans. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Independent video scrub: random Range windows across the file.
 * Sequential seeks（不並發）— 重點測 DC＋I/O 延遲下的快轉，不是 HTTP 連線額度。
 */
export function randomMovieSeekPlan(opts?: {
  fileSize?: number;
  slice?: number;
  count?: number;
  seed?: number;
}): { label: string; start: number; end: number }[] {
  const fileSize = opts?.fileSize ?? ROOM_XFER_MOVIE_SIZE;
  const slice = opts?.slice ?? ROOM_XFER_RANGE_SLICE;
  const count = Math.max(1, opts?.count ?? ROOM_XFER_SCRUB_SEEKS);
  const rand = mulberry32(opts?.seed ?? ROOM_XFER_MOVIE_SEED);
  const maxStart = Math.max(0, fileSize - slice);
  const out: { label: string; start: number; end: number }[] = [];
  for (let i = 0; i < count; i++) {
    const start = Math.floor(rand() * (maxStart + 1));
    out.push({
      label: `scrub-${i + 1}`,
      start,
      end: start + slice - 1,
    });
  }
  return out;
}

async function productDownload(
  xfer: RoomFileTransfer,
  id: string,
  label: string
): Promise<RoomXferFetchResult> {
  const mem = createMemorySaveWritable();
  const dl = await xfer.download(id, async () => mem.writable);
  if (!dl.ok) {
    return {
      index: 0,
      ok: false,
      status: 0,
      bytes: mem.byteLength(),
      error: dl.error,
      label,
    };
  }
  return {
    index: 0,
    ok: true,
    status: 200,
    bytes: mem.byteLength(),
    sha256: await sha256Hex(mem.bytes()),
    label,
  };
}

/** ① 預覽圖片 — 對齊 GoRoomSurface onPlayFile + `<img src=playback.url>`. */
export async function runImagePreviewScenario(
  xfer: RoomFileTransfer,
  id: string
): Promise<RoomXferImagePreview> {
  const played = await xfer.play(id);
  if (!played.ok) {
    return { ok: false, url: "", error: played.error };
  }
  const url = xfer.getState().playback?.url ?? "";
  const expectUrl = roomFilePath(id, { purpose: "play" });
  if (url !== expectUrl) {
    xfer.stopPlay();
    return {
      ok: false,
      url,
      error: `playback.url 必須是 ${expectUrl}`,
    };
  }
  const imgOk = await new Promise<boolean>((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), 8000);
    img.onload = () => {
      clearTimeout(t);
      resolve(img.naturalWidth > 0);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(false);
    };
    img.src = url;
  });
  xfer.stopPlay();
  return imgOk
    ? { ok: true, url }
    : { ok: false, url, error: "img load failed" };
}

/**
 * ④ 私下播大影片 — **產品順序**：play() → attachPlaybackUrl(`<video preload=metadata>`)
 * → 仍掛著 video 時做頭尾並發／前後 scrub Range。
 *
 * 若 `<video>` 佔滿同 origin 連線（約 6 路），後續 Range 會 `Failed to fetch`——
 * 這是要找出的瓶頸，**不**為通過測試而先 Range 再掛 video。
 * detach 後再 probe 一次，用來證明根因是 video 佔線。
 */
export async function runVideoPrivatePlayScenario(
  xfer: RoomFileTransfer,
  id: string,
  opts?: { size?: number; seed?: number }
): Promise<RoomXferVideoPlay> {
  const size = opts?.size ?? ROOM_XFER_MOVIE_SIZE;
  const seed = opts?.seed ?? ROOM_XFER_MOVIE_SEED;
  const failEarly = (
    partial: Partial<RoomXferVideoPlay> & { error?: string }
  ): RoomXferVideoPlay => ({
    ok: false,
    attached: false,
    dualProbeOk: false,
    seek: [],
    connectionStarved: false,
    starvedLabels: [],
    recoveredAfterDetach: false,
    ...partial,
  });

  const played = await xfer.play(id);
  if (!played.ok) {
    return failEarly({ error: played.error });
  }
  const url = xfer.getState().playback?.url ?? roomFilePath(id, { purpose: "play" });

  const video = document.createElement("video");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  /** Same as GoRoomSurface private play. */
  video.preload = "metadata";
  video.muted = true;
  let attached = false;
  try {
    attachPlaybackUrl(video, url, { muted: true });
    attached = Boolean(video.getAttribute("src") || video.src);
    /** Give AV engine time to open its HTTP Range slots. */
    await new Promise((r) => setTimeout(r, 500));
    xfer.notePlayhead(0);
  } catch (e) {
    attachPlaybackUrl(video, null);
    video.remove();
    xfer.stopPlay();
    return failEarly({
      attached,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const plan = movieSeekPlan(size);
  const head = plan.find((p) => p.label === "head")!;
  const mid = plan.find((p) => p.label === "seek-mid")!;
  const forward = plan.find((p) => p.label === "seek-forward")!;
  const back = plan.find((p) => p.label === "seek-back")!;
  const tail = plan.find((p) => p.label === "tail")!;

  const seek: RoomXferSeekStep[] = [];
  /** While `<video>` is still attached — product reality. */
  seek.push(
    await fetchRoomFileRangeVerified(id, head.start, head.end, seed, "head")
  );
  const [dualHead, dualTail] = await Promise.all([
    fetchRoomFileRangeVerified(id, head.start, head.end, seed, "dual-head", 1),
    fetchRoomFileRangeVerified(id, tail.start, tail.end, seed, "dual-tail", 2),
  ]);
  seek.push(dualHead, dualTail);

  for (const step of [mid, forward, back]) {
    const approxSec = step.start / (size / 120);
    void xfer.seekPlay(step.start, id);
    xfer.notePlayhead(approxSec);
    seek.push(
      await fetchRoomFileRangeVerified(
        id,
        step.start,
        step.end,
        seed,
        step.label
      )
    );
  }

  const starvedLabels = seek
    .filter((s) => isConnectionStarvation(s))
    .map((s) => s.label);
  const connectionStarved = starvedLabels.length > 0;
  const dualProbeOk = dualHead.ok && dualTail.ok;
  const rangesOk = dualProbeOk && seek.every((s) => s.ok && s.patternOk);

  /**
   * Release media HTTP slots, then prove Ranges work again.
   * stopPlay first so SW drops the media-bound transfer; re-play for a clean probe.
   */
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    /* ignore */
  }
  attachPlaybackUrl(video, null);
  video.remove();
  xfer.stopPlay();
  await new Promise((r) => setTimeout(r, 600));
  const replay = await xfer.play(id);
  let recoveredAfterDetach = false;
  if (replay.ok) {
    const recovery = await fetchRoomFileRangeVerified(
      id,
      head.start,
      head.end,
      seed,
      "after-detach-head"
    );
    recoveredAfterDetach = recovery.ok && Boolean(recovery.patternOk);
  }
  xfer.stopPlay();

  const ok = attached && rangesOk && !connectionStarved;
  let error: string | undefined;
  if (!attached) error = "attachPlaybackUrl 未掛上 src";
  else if (connectionStarved) {
    error = `瓶頸：<video> 佔線 → Range 失敗 [${starvedLabels.join(", ")}]；detach 後恢復=${recoveredAfterDetach}`;
  } else if (!rangesOk) error = "video scrub Range 未全數成功";

  return {
    ok,
    attached,
    dualProbeOk,
    seek,
    connectionStarved,
    starvedLabels,
    recoveredAfterDetach,
    error,
  };
}

/** Browser connection-pool / SW starvation while media holds GETs. */
export function isConnectionStarvation(step: RoomXferFetchResult): boolean {
  if (step.ok) return false;
  const err = (step.error ?? "").toLowerCase();
  if (step.status === 0 && (err.includes("failed to fetch") || err.includes("network"))) {
    return true;
  }
  if (err.includes("failed to fetch")) return true;
  return false;
}

/**
 * Independent large-video scrub test.
 * play() → sequential random Range seeks（不掛 `<video>`，避免 HTTP 連線額度干擾）.
 * Host movie File uses `ioDelayMs` so each chunk read waits like disk I/O.
 */
export async function runVideoScrubScenario(
  xfer: RoomFileTransfer,
  id: string,
  opts?: {
    size?: number;
    seed?: number;
    seekCount?: number;
    seekSeed?: number;
    ioDelayMs?: number;
  }
): Promise<Omit<RoomXferScrubReport, "swControlled" | "message"> & { error?: string }> {
  const size = opts?.size ?? ROOM_XFER_MOVIE_SIZE;
  const seed = opts?.seed ?? ROOM_XFER_MOVIE_SEED;
  const ioDelayMs = opts?.ioDelayMs ?? ROOM_XFER_IO_DELAY_MS;
  const played = await xfer.play(id);
  if (!played.ok) {
    return {
      ok: false,
      playOk: false,
      url: "",
      ioDelayMs,
      seeks: [],
      elapsedMs: 0,
      error: played.error,
    };
  }
  const url = xfer.getState().playback?.url ?? "";
  const expectUrl = roomFilePath(id, { purpose: "play" });
  if (url !== expectUrl) {
    xfer.stopPlay();
    return {
      ok: false,
      playOk: false,
      url,
      ioDelayMs,
      seeks: [],
      elapsedMs: 0,
      error: `playback.url 必須是 ${expectUrl}`,
    };
  }

  const plan = randomMovieSeekPlan({
    fileSize: size,
    count: opts?.seekCount ?? ROOM_XFER_SCRUB_SEEKS,
    seed: opts?.seekSeed ?? ROOM_XFER_MOVIE_SEED ^ 0x9e3779b9,
  });
  const seeks: RoomXferSeekStep[] = [];
  const t0 = Date.now();
  for (const step of plan) {
    const approxSec = step.start / (size / 120);
    void xfer.seekPlay(step.start, id);
    xfer.notePlayhead(approxSec);
    seeks.push(
      await fetchRoomFileRangeVerified(
        id,
        step.start,
        step.end,
        seed,
        step.label
      )
    );
  }
  const elapsedMs = Date.now() - t0;
  xfer.stopPlay();

  const allOk = seeks.every((s) => s.ok && s.patternOk);
  /** With I/O delay, wall time should exceed seeks × delay (lower bound soft). */
  const minExpected = seeks.length * Math.max(0, ioDelayMs - 5);
  const delayPlausible =
    ioDelayMs <= 0 || elapsedMs >= Math.min(minExpected, ioDelayMs);

  return {
    ok: allOk && delayPlausible,
    playOk: true,
    url,
    ioDelayMs,
    seeks,
    elapsedMs,
    error: !allOk
      ? `隨機快轉失敗：${seeks.filter((s) => !s.ok || !s.patternOk).map((s) => s.label).join(", ") || "?"}`
      : !delayPlausible
        ? `I/O 延遲未反映在耗時（elapsed=${elapsedMs}ms，ioDelay=${ioDelayMs}ms×${seeks.length}）`
        : undefined,
  };
}

/**
 * Skip SW: open save job → admit `count` download tasks directly → wait until
 * **every** inbound has pumped `expectBytes` over DC → `noteHttpTransferEnd`.
 * Overflow must reject. Use a large delayed fixture（`xf-sched`）so this is
 * not an instant admit smoke test.
 */
export async function runDirectDownloadSchedScenario(
  xfer: RoomFileTransfer,
  id: string,
  opts?: {
    count?: number;
    size?: number;
    waitMs?: number;
    /** Host per-slice I/O delay（for soft elapsed floor）. */
    ioDelayMs?: number;
    /** Soft wall-clock floor；`0` disables（unit tests）. */
    minElapsedMs?: number;
  }
): Promise<Omit<RoomXferDirectDlReport, "message"> & { error?: string }> {
  const maxTasks = ROOM_FILE_JOB_MAX_TASKS;
  const count = Math.min(maxTasks, Math.max(1, opts?.count ?? maxTasks));
  const entry = xfer.getState().entries.find((e) => e.id === id);
  const size = opts?.size ?? entry?.size ?? 0;
  const ioDelayMs = Math.max(0, Math.floor(opts?.ioDelayMs ?? 0));
  const chunkApprox = 16 * 1024;
  const minElapsedMs =
    opts?.minElapsedMs ??
    (ioDelayMs > 0 && size >= chunkApprox
      ? Math.min(
          30_000,
          Math.floor(size / chunkApprox) * Math.max(1, Math.floor(ioDelayMs * 0.35))
        )
      : 0);
  const empty = (error: string) => ({
    ok: false as const,
    taskCount: count,
    maxTasks,
    admitted: 0,
    overflowRejected: false,
    completed: 0,
    bytesPumped: 0,
    ioDelayMs,
    elapsedMs: 0,
    error,
  });
  if (!entry || size <= 0) {
    return empty("找不到檔或 size=0");
  }

  const opened = await xfer.openRemoteHttp(id, "save");
  if (!opened.ok) {
    return empty(opened.error ?? "openRemoteHttp failed");
  }

  const tids: string[] = [];
  let admitted = 0;
  for (let i = 0; i < count; i++) {
    const transferId = `direct-dl-${i + 1}`;
    const r = xfer.acceptHttpTransfer({
      fileId: id,
      transferId,
      offset: 0,
      purpose: "save",
    });
    if (!r.ok) {
      xfer.stopPlay();
      return {
        ...empty(`admit ${transferId}: ${r.error}`),
        admitted,
      };
    }
    tids.push(transferId);
    admitted += 1;
  }

  const overflow = xfer.acceptHttpTransfer({
    fileId: id,
    transferId: "direct-dl-overflow",
    offset: 0,
    purpose: "save",
  });
  const overflowRejected = !overflow.ok;

  const t0 = Date.now();
  const waitMs = opts?.waitMs ?? 120_000;
  let bytesPumped = 0;
  let allFull = false;
  while (Date.now() - t0 < waitMs) {
    const snaps = xfer
      .inboundSnaps()
      .filter((s) => tids.includes(s.transferId));
    bytesPumped = snaps.reduce((n, s) => n + s.received, 0);
    allFull =
      snaps.length === tids.length &&
      snaps.every((s) => s.received >= s.expectBytes && s.expectBytes > 0);
    if (allFull) break;
    await new Promise((r) => setTimeout(r, 40));
  }

  let completed = 0;
  if (allFull) {
    for (const transferId of tids) {
      xfer.noteHttpTransferEnd({
        fileId: id,
        transferId,
        ok: true,
        delivered: size,
      });
      completed += 1;
    }
  }
  const elapsedMs = Date.now() - t0;
  xfer.stopPlay();

  const delayPlausible = minElapsedMs <= 0 || elapsedMs >= minElapsedMs;
  const ok =
    admitted === count &&
    overflowRejected &&
    allFull &&
    completed === admitted &&
    delayPlausible;
  return {
    ok,
    taskCount: count,
    maxTasks,
    admitted,
    overflowRejected,
    completed,
    bytesPumped,
    ioDelayMs,
    elapsedMs,
    error: !overflowRejected
      ? "overflow 應被拒絕"
      : !allFull
        ? `逾時：未等齊 ${count} 路 DC 泵滿（pumped=${bytesPumped}/${size * count}）`
          : !delayPlausible
          ? `I/O／排程未反映在耗時（elapsed=${elapsedMs}ms，min=${minElapsedMs}ms，ioDelay=${ioDelayMs}ms）`
          : undefined,
  };
}

export function createRoomXferHarness(opts: {
  role: RoomXferRole;
  room?: string;
}): RoomXferHarness {
  const role = opts.role;
  const room = (opts.room ?? "default").trim() || "default";
  const agentId =
    role === "host" ? `xfer-host-${room}` : `xfer-guest-${room}`;
  const displayName = role === "host" ? "掛檔端" : "索取端";

  let phase = "idle";
  let dcOpen = false;
  let swReady = false;
  let lastReport: RoomXferStressReport | null = null;
  let lastScrubReport: RoomXferScrubReport | null = null;
  let lastDirectDlReport: RoomXferDirectDlReport | null = null;
  const log: string[] = [];
  const listeners = new Set<() => void>();

  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let xfer: RoomFileTransfer | null = null;
  let unsubXfer: (() => void) | null = null;
  let unlistenOpen: (() => void) | null = null;
  let unlistenEnd: (() => void) | null = null;
  let unlistenSaveCancel: (() => void) | null = null;
  let channel: BroadcastChannel | null = null;
  let entries: RoomFileEntry[] = [];
  let disposed = false;
  const pendingIce: RTCIceCandidateInit[] = [];

  function emit() {
    for (const l of listeners) l();
  }

  function pushLog(line: string) {
    log.push(`${new Date().toISOString().slice(11, 23)} ${line}`);
    if (log.length > 200) log.shift();
    emit();
  }

  function setPhase(next: string) {
    phase = next;
    emit();
  }

  function post(msg: RoomXferSignal) {
    channel?.postMessage(msg);
  }

  function wireChannel(ch: RTCDataChannel) {
    dc = ch;
    ch.binaryType = "arraybuffer";
    ch.addEventListener("open", () => {
      dcOpen = true;
      setPhase("dc-open");
      pushLog("DataChannel open");
      if (role === "host") {
        void mountFixtures().then((r) => {
          if (!r.ok) pushLog(`mount failed: ${r.error ?? "?"}`);
        });
      }
    });
    ch.addEventListener("close", () => {
      dcOpen = false;
      setPhase("dc-closed");
      pushLog("DataChannel closed");
    });
    ch.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") {
        try {
          const data = JSON.parse(ev.data) as unknown;
          if (isSessionFileControl(data)) xfer?.onControl(data);
        } catch {
          /* ignore */
        }
        return;
      }
      if (ev.data instanceof ArrayBuffer) {
        xfer?.onBinary(ev.data);
        return;
      }
      if (ArrayBuffer.isView(ev.data)) {
        const view = ev.data as ArrayBufferView;
        const copy = new Uint8Array(view.byteLength);
        copy.set(
          new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
        );
        xfer?.onBinary(copy.buffer);
      }
    });
  }

  function wireTransferListeners(t: RoomFileTransfer) {
    unlistenOpen?.();
    unlistenEnd?.();
    unlistenSaveCancel?.();
    /** Same three SW→page listeners as `goRoomFiles.#boot`. */
    unlistenOpen = listenRoomOpenTransfer((msg) => {
      t.acceptHttpTransfer(msg);
    });
    unlistenEnd = listenRoomTransferEnd((msg) => {
      t.noteHttpTransferEnd(msg);
    });
    unlistenSaveCancel = listenRoomPlaySaveCancel((playId) => {
      t.cancelHttpSave(playId);
    });
  }

  function attachTransfer() {
    xfer?.dispose();
    unsubXfer?.();
    unlistenOpen?.();
    unlistenEnd?.();
    unlistenSaveCancel?.();
    xfer = createRoomFileTransfer({
      localAgentId: agentId,
      localName: displayName,
      sendJson: (msg: SessionFileControl) => {
        if (!dc || dc.readyState !== "open") return;
        dc.send(JSON.stringify(msg));
      },
      sendBinary: (buf) => {
        if (!dc || dc.readyState !== "open") return;
        dc.send(buf);
      },
      bufferedAmount: () => dc?.bufferedAmount ?? 0,
      newId: () => `sf-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
    });
    unsubXfer = xfer.subscribe((s) => {
      entries = s.entries;
      emit();
    });
    wireTransferListeners(xfer);
  }

  async function mountFixtures(): Promise<{ ok: boolean; error?: string }> {
    if (role !== "host" || !xfer) {
      return { ok: false, error: "僅 Host 可掛檔" };
    }
    const ready = await ensureRoomFileSw();
    swReady = ready;
    emit();
    if (!ready) return { ok: false, error: "Service Worker 未控制此頁" };

    const fixtures = buildFixtureFiles();
    const ids = [
      ROOM_XFER_IDS.burst,
      ROOM_XFER_IDS.image,
      ROOM_XFER_IDS.note,
      ROOM_XFER_IDS.movie,
      ROOM_XFER_IDS.sched,
    ] as const;
    const files = [
      fixtures.burst,
      fixtures.image,
      fixtures.note,
      fixtures.movie,
      fixtures.sched,
    ];
    let n = 0;
    /** Re-create transfer with deterministic share ids. */
    xfer.dispose();
    unsubXfer?.();
    let i = 0;
    /**
     * Sparse movie／sched must NOT be postMessage’d to SW as local File —
     * structured clone drops the size/slice patch (becomes 0‑byte), and the
     * shared SW would then 416 every Guest Range for the same id.
     */
    for (const skipId of [ROOM_XFER_IDS.movie, ROOM_XFER_IDS.sched] as const) {
      try {
        unregisterLocalRoomFile(skipId);
      } catch {
        /* ignore */
      }
    }
    xfer = createRoomFileTransfer({
      localAgentId: agentId,
      localName: displayName,
      sendJson: (msg: SessionFileControl) => {
        if (!dc || dc.readyState !== "open") return;
        dc.send(JSON.stringify(msg));
      },
      sendBinary: (buf) => {
        if (!dc || dc.readyState !== "open") return;
        dc.send(buf);
      },
      bufferedAmount: () => dc?.bufferedAmount ?? 0,
      newId: () => ids[i++] ?? `sf-extra-${++n}`,
      registerLocalFile: (id, file) => {
        if (id === ROOM_XFER_IDS.movie || id === ROOM_XFER_IDS.sched) return;
        registerLocalRoomFile(id, file);
      },
      unregisterLocalFile: (id) => {
        unregisterLocalRoomFile(id);
      },
    });
    unsubXfer = xfer.subscribe((s) => {
      entries = s.entries;
      emit();
    });
    wireTransferListeners(xfer);

    for (const file of files) {
      const r = await xfer.shareLocalFile(file);
      if (!r.ok) return { ok: false, error: r.error };
      pushLog(`mounted ${file.name} → ${r.id}`);
    }
    setPhase("mounted");
    return { ok: true };
  }

  async function ensurePc(forceNew = false): Promise<RTCPeerConnection> {
    if (pc && !forceNew) return pc;
    if (pc) {
      try {
        dc?.close();
      } catch {
        /* ignore */
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      pc = null;
      dc = null;
      dcOpen = false;
    }
    pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
    });
    pc.addEventListener("icecandidate", (ev) => {
      post({
        v: 1,
        type: "ice",
        room,
        role,
        candidate: ev.candidate ? ev.candidate.toJSON() : null,
      });
    });
    pc.addEventListener("connectionstatechange", () => {
      pushLog(`pc ${pc?.connectionState}`);
      emit();
    });
    if (role === "host") {
      const ch = pc.createDataChannel("session_file", { ordered: true });
      wireChannel(ch);
    } else {
      pc.addEventListener("datachannel", (ev) => {
        wireChannel(ev.channel);
      });
    }
    attachTransfer();
    return pc;
  }

  async function hostFreshOffer(reason: string): Promise<void> {
    const peer = await ensurePc(true);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    pendingIce.length = 0;
    post({
      v: 1,
      type: "offer",
      room,
      sdp: peer.localDescription!.toJSON(),
    });
    setPhase("offering");
    pushLog(`sent offer (${reason})`);
  }

  async function applyIce(cand: RTCIceCandidateInit | null) {
    if (!pc) {
      if (cand) pendingIce.push(cand);
      return;
    }
    if (!cand) return;
    try {
      await pc.addIceCandidate(cand);
    } catch (e) {
      pushLog(`ice err: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function flushIce() {
    while (pendingIce.length && pc) {
      const c = pendingIce.shift();
      if (c) await applyIce(c);
    }
  }

  async function onSignal(raw: unknown) {
    const msg = parseSignal(raw);
    if (!msg) return;
    if ("room" in msg && msg.room !== room) return;

    if (
      role === "host" &&
      msg.type === "hello" &&
      msg.role === "guest"
    ) {
      if (dcOpen && pc?.connectionState === "connected") {
        pushLog("guest hello ignored (already connected)");
        return;
      }
      await hostFreshOffer("guest hello");
      return;
    }

    if (msg.type === "hello") return;

    if (msg.type === "ice" && msg.role !== role) {
      await applyIce(msg.candidate);
      return;
    }

    if (role === "guest" && msg.type === "offer") {
      /** New offer from host — always take a fresh PC. */
      const peer = await ensurePc(true);
      await peer.setRemoteDescription(msg.sdp);
      await flushIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      post({
        v: 1,
        type: "answer",
        room,
        sdp: peer.localDescription!.toJSON(),
      });
      setPhase("answered");
      pushLog("sent answer");
      return;
    }

    if (role === "host" && msg.type === "answer" && pc) {
      if (pc.signalingState !== "have-local-offer") {
        pushLog(`ignore answer (signaling=${pc.signalingState})`);
        return;
      }
      await pc.setRemoteDescription(msg.sdp);
      await flushIce();
      setPhase("connected");
      pushLog("got answer");
    }
  }

  async function start(): Promise<void> {
    if (disposed) return;
    channel = new BroadcastChannel(`${ROOM_XFER_CHANNEL}:${room}`);
    channel.onmessage = (ev) => {
      void onSignal(ev.data);
    };

    swReady = await ensureRoomFileSw();
    emit();
    pushLog(swReady ? "SW controlling" : "SW NOT controlling");

    if (role === "host") {
      await hostFreshOffer("start");
      post({ v: 1, type: "hello", role: "host", room });
    } else {
      setPhase("waiting-offer");
      post({ v: 1, type: "hello", role: "guest", room });
    }
  }

  async function runStress(): Promise<RoomXferStressReport> {
    const empty = (): RoomXferStressReport => ({
      ok: false,
      swControlled: Boolean(navigator.serviceWorker?.controller),
      filesListed: entries.length,
      imagePreview: null,
      downloadDoc: null,
      downloadBinary: null,
      videoPlay: null,
      tunnelStress: [],
      download: null,
      concurrent: [],
      image: null,
      note: null,
      seek: [],
      previewOk: false,
      message: "",
    });

    const fail = (message: string): RoomXferStressReport => {
      const report = { ...empty(), message };
      lastReport = report;
      emit();
      return report;
    };

    if (role !== "guest") return fail("僅 Guest 跑壓力測試");
    if (!dcOpen || !xfer) return fail("DataChannel 未開");

    const swOk = await ensureRoomFileSw();
    swReady = swOk;
    emit();
    if (!swOk || !navigator.serviceWorker?.controller) {
      return fail("頁面必須由 Service Worker 控制才能存取 /room-file/");
    }

    const waitListing = async () => {
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        const ids = new Set(xfer!.getState().entries.map((e) => e.id));
        if (
          ids.has(ROOM_XFER_IDS.burst) &&
          ids.has(ROOM_XFER_IDS.image) &&
          ids.has(ROOM_XFER_IDS.note) &&
          ids.has(ROOM_XFER_IDS.movie)
        ) {
          return true;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    };

    if (!(await waitListing())) {
      return fail(`目錄未齊（現有 ${entries.length}）`);
    }

    /**
     * 真實旅程（對齊包廂分享區；大影片 scrub 另見 runVideoScrub）：
     * ① 預覽圖片 → ② 下載文件 → ③ 下載較大二進位（單路）→ ④ 隧道並發壓力
     */

    setPhase("scenario-preview");
    pushLog("① preview image (play + img)");
    const imagePreview = await runImagePreviewScenario(
      xfer,
      ROOM_XFER_IDS.image
    );
    if (!imagePreview.ok) {
      return fail(`① 預覽失敗: ${imagePreview.error}`);
    }

    setPhase("scenario-download-doc");
    pushLog("② download() note.txt");
    const downloadDoc = await productDownload(
      xfer,
      ROOM_XFER_IDS.note,
      "download-doc"
    );
    if (!downloadDoc.ok) {
      return fail(`② 下載文件失敗: ${downloadDoc.error}`);
    }

    setPhase("scenario-download-binary");
    pushLog("③ download() burst.bin (single stream)");
    const downloadBinary = await productDownload(
      xfer,
      ROOM_XFER_IDS.burst,
      "download-binary"
    );
    if (!downloadBinary.ok) {
      return fail(`③ 下載二進位失敗: ${downloadBinary.error}`);
    }

    setPhase("scenario-tunnel-stress");
    pushLog(`④ tunnel stress ${ROOM_XFER_CONCURRENT}×GET`);
    const openBurst = await xfer.openRemoteHttp(ROOM_XFER_IDS.burst, "save");
    if (!openBurst.ok) {
      return fail(`④ open burst 失敗: ${openBurst.error}`);
    }
    const tunnelStress = await Promise.all(
      Array.from({ length: ROOM_XFER_CONCURRENT }, (_, index) =>
        fetchRoomFileViaSw(ROOM_XFER_IDS.burst, index)
      )
    );
    xfer.stopPlay();
    const tunnelOk =
      tunnelStress.length === ROOM_XFER_CONCURRENT &&
      tunnelStress.every((c) => c.ok && c.bytes > 0) &&
      new Set(tunnelStress.map((c) => c.bytes)).size === 1;

    if (!tunnelOk) {
      const report: RoomXferStressReport = {
        ...empty(),
        ok: false,
        swControlled: true,
        filesListed: entries.length,
        imagePreview,
        downloadDoc,
        downloadBinary,
        videoPlay: null,
        tunnelStress,
        download: downloadDoc,
        concurrent: tunnelStress,
        previewOk: true,
        seek: [],
        message: `④ 隧道 ${ROOM_XFER_CONCURRENT}×GET 未全數成功`,
      };
      lastReport = report;
      setPhase("stress-fail");
      emit();
      return report;
    }

    const ok = true;
    const report: RoomXferStressReport = {
      ok,
      swControlled: true,
      filesListed: entries.length,
      imagePreview,
      downloadDoc,
      downloadBinary,
      videoPlay: null,
      tunnelStress,
      download: downloadDoc,
      concurrent: tunnelStress,
      image: {
        index: 0,
        ok: true,
        status: 200,
        bytes: 0,
        label: "image-preview",
      },
      note: downloadDoc,
      seek: [],
      previewOk: true,
      message: `通過：①預覽 ②下載文件 ③單路下載 ④隧道${ROOM_XFER_CONCURRENT}×GET`,
    };
    lastReport = report;
    setPhase("stress-pass");
    pushLog(report.message);
    emit();
    return report;
  }

  async function runVideoScrub(): Promise<RoomXferScrubReport> {
    const fail = (message: string): RoomXferScrubReport => {
      const report: RoomXferScrubReport = {
        ok: false,
        swControlled: Boolean(navigator.serviceWorker?.controller),
        playOk: false,
        url: "",
        ioDelayMs: ROOM_XFER_IO_DELAY_MS,
        seeks: [],
        elapsedMs: 0,
        message,
      };
      lastScrubReport = report;
      emit();
      return report;
    };

    if (role !== "guest") return fail("僅 Guest 跑大影片 scrub");
    if (!dcOpen || !xfer) return fail("DataChannel 未開");

    const swOk = await ensureRoomFileSw();
    swReady = swOk;
    emit();
    if (!swOk || !navigator.serviceWorker?.controller) {
      return fail("頁面必須由 Service Worker 控制才能存取 /room-file/");
    }

    const hasMovie = xfer
      .getState()
      .entries.some((e) => e.id === ROOM_XFER_IDS.movie);
    if (!hasMovie) {
      return fail("目錄尚無大影片（等 Host 掛檔）");
    }

    setPhase("scenario-video-scrub");
    pushLog(
      `scrub movie: ${ROOM_XFER_SCRUB_SEEKS}× random seek, ioDelay=${ROOM_XFER_IO_DELAY_MS}ms`
    );
    const result = await runVideoScrubScenario(xfer, ROOM_XFER_IDS.movie);
    const report: RoomXferScrubReport = {
      ok: result.ok,
      swControlled: true,
      playOk: result.playOk,
      url: result.url,
      ioDelayMs: result.ioDelayMs,
      seeks: result.seeks,
      elapsedMs: result.elapsedMs,
      message: result.ok
        ? `通過：隨機快轉 ${result.seeks.length} 段（${result.elapsedMs}ms，ioDelay=${result.ioDelayMs}ms／slice）`
        : `失敗：${result.error ?? "?"}`,
    };
    lastScrubReport = report;
    setPhase(result.ok ? "scrub-pass" : "scrub-fail");
    pushLog(report.message);
    emit();
    return report;
  }

  async function runDirectDownloadSched(): Promise<RoomXferDirectDlReport> {
    const fail = (message: string): RoomXferDirectDlReport => {
      const report: RoomXferDirectDlReport = {
        ok: false,
        taskCount: ROOM_FILE_JOB_MAX_TASKS,
        maxTasks: ROOM_FILE_JOB_MAX_TASKS,
        admitted: 0,
        overflowRejected: false,
        completed: 0,
        bytesPumped: 0,
        ioDelayMs: ROOM_XFER_SCHED_IO_DELAY_MS,
        elapsedMs: 0,
        message,
      };
      lastDirectDlReport = report;
      emit();
      return report;
    };

    if (role !== "guest") return fail("僅 Guest 跑 direct download sched");
    if (!dcOpen || !xfer) return fail("DataChannel 未開");

    const hasSched = xfer
      .getState()
      .entries.some((e) => e.id === ROOM_XFER_IDS.sched);
    if (!hasSched) return fail("目錄尚無 sched.bin（請 Host 重新掛檔）");

    setPhase("scenario-direct-dl-sched");
    pushLog(
      `direct download sched: ${ROOM_FILE_JOB_MAX_TASKS}×${ROOM_XFER_SCHED_SIZE}B ` +
        `ioDelay=${ROOM_XFER_SCHED_IO_DELAY_MS}ms (skip SW)`
    );
    const result = await runDirectDownloadSchedScenario(
      xfer,
      ROOM_XFER_IDS.sched,
      {
        ioDelayMs: ROOM_XFER_SCHED_IO_DELAY_MS,
      }
    );
    const report: RoomXferDirectDlReport = {
      ok: result.ok,
      taskCount: result.taskCount,
      maxTasks: result.maxTasks,
      admitted: result.admitted,
      overflowRejected: result.overflowRejected,
      completed: result.completed,
      bytesPumped: result.bytesPumped,
      ioDelayMs: result.ioDelayMs,
      elapsedMs: result.elapsedMs,
      message: result.ok
        ? `通過：skip-SW ${result.admitted}×${ROOM_XFER_SCHED_SIZE}B ` +
          `（${result.elapsedMs}ms，pumped=${result.bytesPumped}，ioDelay=${result.ioDelayMs}ms）`
        : `失敗：${result.error ?? "?"}`,
    };
    lastDirectDlReport = report;
    setPhase(result.ok ? "direct-dl-pass" : "direct-dl-fail");
    pushLog(report.message);
    emit();
    return report;
  }

  function dispose() {
    disposed = true;
    unlistenOpen?.();
    unlistenEnd?.();
    unlistenSaveCancel?.();
    unsubXfer?.();
    xfer?.dispose();
    xfer = null;
    try {
      dc?.close();
    } catch {
      /* ignore */
    }
    try {
      pc?.close();
    } catch {
      /* ignore */
    }
    channel?.close();
    channel = null;
    pc = null;
    dc = null;
    setPhase("disposed");
  }

  return {
    role,
    start,
    dispose,
    mountFixtures,
    runStress,
    runVideoScrub,
    runDirectDownloadSched,
    getState: () => ({
      phase,
      dcOpen,
      swReady,
      entries: entries.map((e) => ({ ...e })),
      lastReport,
      lastScrubReport,
      lastDirectDlReport,
      log: [...log],
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      listener();
      return () => listeners.delete(listener);
    },
  };
}
