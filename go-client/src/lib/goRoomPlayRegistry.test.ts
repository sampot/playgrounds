import { describe, expect, it } from "vitest";
import {
  createRoomPlayRegistry,
  fileSpansCover,
  isWebKitMediaEngine,
  localFileSlice,
  mediaRangeForBufferedBody,
  parseByteRange,
  parseRoomFilePath,
  parseRoomFilePurpose,
  parseRoomPlayPath,
  playFetchRange,
  putFileSpan,
  isBytesRangeHeader,
  roomFileContentType,
  roomFileDownloadPath,
  roomFileHttpBodyKind,
  roomFileMethodAllowed,
  roomFilePath,
  roomFileServeByteRange,
  roomPlayPath,
  SESSION_FILE_PLAY_MEDIA_BLOB_MAX,
} from "./goRoomPlayRegistry";

async function readAll(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) parts.push(value);
  }
  const n = parts.reduce((s, p) => s + p.byteLength, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

describe("room file path", () => {
  it("uses /room-file/ as the canonical same-origin URL", () => {
    expect(roomFilePath("tr-1")).toBe("/room-file/tr-1");
    expect(roomPlayPath("tr-1")).toBe("/room-file/tr-1?purpose=play");
    expect(parseRoomFilePath("/room-file/tr-1")).toBe("tr-1");
    expect(parseRoomFilePath("/room-play/tr-1")).toBe("tr-1");
    expect(parseRoomPlayPath("/room-play/legacy")).toBe("legacy");
    expect(parseRoomFilePath("/room-file/tr-1?purpose=play")).toBe("tr-1");
    expect(parseRoomFilePath("/room/tr-1")).toBeNull();
  });

  it("can carry ?purpose= so the Page tells SW task priority (not ?download=)", () => {
    expect(roomFilePath("tr-1", { purpose: "play" })).toBe(
      "/room-file/tr-1?purpose=play"
    );
    expect(roomFilePath("tr-1", { purpose: "save" })).toBe(
      "/room-file/tr-1?purpose=save"
    );
    expect(roomFileDownloadPath("tr-1")).toBe("/room-file/tr-1?purpose=save");
    expect(parseRoomFilePurpose("?purpose=play")).toBe("play");
    expect(parseRoomFilePurpose("?purpose=save")).toBe("save");
    expect(parseRoomFilePurpose("?purpose=other")).toBeUndefined();
    expect(parseRoomFilePurpose("")).toBeUndefined();
  });
});

describe("playFetchRange", () => {
  it("does not invent a Range for unranged GET (200 + live body, not synthetic 206)", () => {
    expect(playFetchRange(null, 400 * 1024 * 1024)).toBeNull();
    expect(playFetchRange(undefined, 100)).toBeNull();
    expect(playFetchRange("", 100)).toBeNull();
  });

  it("keeps an explicit Range header", () => {
    expect(playFetchRange("bytes=8-15", 100)).toEqual({ start: 8, end: 15 });
  });
});

describe("parseByteRange", () => {
  it("reads closed and open HTTP ranges", () => {
    expect(parseByteRange("bytes=0-1", 8)).toEqual({ start: 0, end: 1 });
    expect(parseByteRange("bytes=2-", 8)).toEqual({ start: 2, end: 7 });
    expect(parseByteRange("bytes=-3", 8)).toEqual({ start: 5, end: 7 });
    expect(parseByteRange(null, 8)).toBeNull();
  });

  it("rejects unsatisfiable ranges (start past EOF)", () => {
    expect(parseByteRange("bytes=100-200", 50)).toBeNull();
  });
});

describe("roomFile HTTP helpers", () => {
  it("allows only GET and HEAD", () => {
    expect(roomFileMethodAllowed("GET")).toBe(true);
    expect(roomFileMethodAllowed("HEAD")).toBe(true);
    expect(roomFileMethodAllowed("POST")).toBe(false);
  });

  it("detects bytes= Range headers", () => {
    expect(isBytesRangeHeader("bytes=0-1")).toBe(true);
    expect(isBytesRangeHeader(null)).toBe(false);
    expect(isBytesRangeHeader("")).toBe(false);
  });
});

describe("createRoomPlayRegistry", () => {
  it("streams original bytes in order without assembling a page Blob", async () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", { mime: "video/mp4", size: 8, maxBytes: 32 });
    const body = Promise.resolve(reg.liveBody("t1")).then(readAll);
    expect(reg.push("t1", new Uint8Array([1, 2, 3, 4]))).toBe("low");
    expect(reg.push("t1", new Uint8Array([5, 6, 7, 8]))).toBe("low");
    reg.end("t1");
    expect(Array.from(await body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("streams a whole-file Range like HTTP (full Content-Length, not a 512KiB slice)", async () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", { mime: "video/mp4", size: 12, maxBytes: 32 });
    const stream = await reg.rangeBody("t1", { start: 0, end: 11 });
    const reader = stream.getReader();
    const firstP = reader.read();
    reg.push("t1", new Uint8Array([1, 2, 3, 4]));
    expect(Array.from((await firstP).value ?? [])).toEqual([1, 2, 3, 4]);
    reg.push("t1", new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12]));
    const rest: number[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) rest.push(...value);
    }
    expect(rest).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("serves a suffix Range after the bytes have arrived", async () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", { mime: "video/mp4", size: 8, maxBytes: 32 });
    const range = reg.rangeBody("t1", { start: 6, end: 7 }).then(readAll);
    expect(reg.push("t1", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 0)).toBe(
      "low"
    );
    expect(Array.from(await range)).toEqual([7, 8]);
  });

  it("stores a seek span without waiting for the gap", async () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", { mime: "video/mp4", size: 8, maxBytes: 32 });
    expect(reg.push("t1", new Uint8Array([1, 2]), 0)).toBe("low");
    expect(reg.push("t1", new Uint8Array([7, 8]), 6)).toBe("low");
    expect(reg.covers("t1", 0, 2)).toBe(true);
    expect(reg.covers("t1", 6, 8)).toBe(true);
    expect(reg.covers("t1", 2, 6)).toBe(false);
    expect(Array.from(await readAll(await reg.rangeBody("t1", { start: 6, end: 7 })))).toEqual(
      [7, 8]
    );
  });

  it("signals high pressure before holding more than the play window", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mime: "video/mp4",
      size: 64,
      maxBytes: 8,
      highBytes: 8,
      lowBytes: 2,
      headBytes: 64,
    });
    expect(reg.push("t1", new Uint8Array(6))).toBe("ok");
    expect(reg.push("t1", new Uint8Array(6))).toBe("high");
  });

  it("rejects chunks outside the pin window so the producer can pause", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mime: "application/octet-stream",
      size: 100,
      maxBytes: 16,
      highBytes: 12,
      lowBytes: 4,
    });
    reg.pin("t1", "r0", 0);
    expect(reg.push("t1", new Uint8Array(8).fill(1), 0)).toBe("ok");
    expect(reg.push("t1", new Uint8Array(8).fill(9), 80)).toBe("high");
    expect(reg.covers("t1", 80, 88)).toBe(false);
    expect(reg.covers("t1", 0, 8)).toBe(true);
  });

  it("keeps unread bytes at the stream pin instead of sliding past them", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mime: "application/octet-stream",
      size: 48,
      maxBytes: 16,
      highBytes: 24,
      lowBytes: 4,
      headBytes: 4,
    });
    reg.pin("t1", "r0", 0);
    expect(reg.push("t1", new Uint8Array(8).fill(1), 0)).toBe("ok");
    expect(reg.push("t1", new Uint8Array(8).fill(2), 8)).toBe("ok");
    expect(reg.push("t1", new Uint8Array(8).fill(3), 16)).toBe("high");
    expect(reg.covers("t1", 0, 16)).toBe(true);
    expect(reg.covers("t1", 16, 24)).toBe(false);
    expect(reg.bufferedBytes("t1")).toBeLessThanOrEqual(16);
  });

  it("keeps adjacent chunks as separate spans (no O(n²) merge copy)", () => {
    /**
     * Large-file save used to merge every DC chunk into one growing Uint8Array.
     * Filling a 32 MiB window with 16 KiB chunks then freezes Chromium mid-download.
     */
    let spans: { start: number; bytes: Uint8Array }[] = [];
    const chunk = 1024;
    const n = 64;
    for (let i = 0; i < n; i++) {
      spans = putFileSpan(spans, i * chunk, new Uint8Array(chunk).fill(i & 0xff));
    }
    expect(spans).toHaveLength(n);
    expect(spans.every((s) => s.bytes.byteLength === chunk)).toBe(true);
    expect(fileSpansCover(spans, 0, n * chunk)).toBe(true);
    expect(Array.from(spans[0]!.bytes.subarray(0, 2))).toEqual([0, 0]);
    expect(Array.from(spans[1]!.bytes.subarray(0, 2))).toEqual([1, 1]);
  });

  it("still merges true overlapping spans", () => {
    let spans = putFileSpan([], 0, new Uint8Array([1, 2, 3, 4]));
    spans = putFileSpan(spans, 2, new Uint8Array([9, 9, 9]));
    expect(spans).toHaveLength(1);
    expect(Array.from(spans[0]!.bytes)).toEqual([1, 2, 9, 9, 9]);
    expect(fileSpansCover(spans, 0, 5)).toBe(true);
  });

  it("save mode filling many small chunks stays covered without one giant buffer", () => {
    const reg = createRoomPlayRegistry();
    reg.open("big-save", {
      mode: "save",
      mime: "application/octet-stream",
      size: 64 * 1024,
      maxBytes: 32 * 1024,
      highBytes: 24 * 1024,
      lowBytes: 8 * 1024,
    });
    reg.pin("big-save", "http", 0);
    const chunk = 1024;
    for (let at = 0; at < 32 * 1024; at += chunk) {
      reg.push("big-save", new Uint8Array(chunk).fill(7), at);
      expect(reg.covers("big-save", at, at + chunk)).toBe(true);
    }
    expect(reg.covers("big-save", 0, 32 * 1024)).toBe(true);
    expect(reg.bufferedBytes("big-save")).toBe(32 * 1024);
    expect(reg.push("big-save", new Uint8Array(chunk), 32 * 1024)).toBe("high");
    expect(reg.covers("big-save", 32 * 1024, 33 * 1024)).toBe(false);
  });

  it("save mode refuses overflow instead of clipping unread ahead bytes", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mode: "save",
      mime: "application/octet-stream",
      size: 48,
      maxBytes: 16,
      highBytes: 24,
      lowBytes: 4,
    });
    reg.pin("t1", "r0", 0);
    expect(reg.push("t1", new Uint8Array(16).fill(1), 0)).toBe("ok");
    /** Play trim would clip a straddling chunk; save must not store a partial. */
    expect(reg.push("t1", new Uint8Array(8).fill(2), 12)).toBe("high");
    expect(reg.covers("t1", 12, 20)).toBe(false);
    expect(reg.covers("t1", 0, 16)).toBe(true);
    reg.pin("t1", "r0", 8);
    expect(reg.push("t1", new Uint8Array(8).fill(2), 16)).toBe("ok");
    expect(reg.covers("t1", 8, 24)).toBe(true);
    expect(reg.bufferedBytes("t1")).toBeLessThanOrEqual(16);
  });

  it("after the pin advances, drops consumed prefix and keeps the next window", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mime: "application/octet-stream",
      size: 48,
      maxBytes: 16,
      highBytes: 24,
      lowBytes: 4,
      headBytes: 4,
    });
    reg.pin("t1", "r0", 0);
    expect(reg.push("t1", new Uint8Array(16).fill(1), 0)).toBe("ok");
    reg.pin("t1", "r0", 8);
    expect(reg.push("t1", new Uint8Array(8).fill(2), 16)).toBe("ok");
    expect(reg.covers("t1", 0, 8)).toBe(false);
    expect(reg.covers("t1", 8, 24)).toBe(true);
    expect(reg.bufferedBytes("t1")).toBeLessThanOrEqual(16);
  });

  it("keeps a second Range pin window without dropping the first", () => {
    const reg = createRoomPlayRegistry();
    reg.open("t1", {
      mime: "application/octet-stream",
      size: 1000,
      maxBytes: 32,
      highBytes: 48,
      lowBytes: 4,
      headBytes: 8,
    });
    reg.pin("t1", "r0", 0);
    reg.pin("t1", "r1", 984);
    expect(reg.push("t1", new Uint8Array(16).fill(1), 0)).toBe("ok");
    expect(reg.push("t1", new Uint8Array(16).fill(9), 984)).toBe("ok");
    expect(reg.covers("t1", 0, 16)).toBe(true);
    expect(reg.covers("t1", 984, 1000)).toBe(true);
    expect(reg.bufferedBytes("t1")).toBeLessThanOrEqual(32);
  });

  it("infers a playable media type when File.type is empty or octet-stream", () => {
    expect(roomFileContentType("video/mp4", "x.bin")).toBe("video/mp4");
    expect(roomFileContentType("", "clip.mp4")).toBe("video/mp4");
    expect(roomFileContentType("application/octet-stream", "clip.m4v")).toBe(
      "video/mp4"
    );
    expect(roomFileContentType("", "clip.mov")).toBe("video/quicktime");
    expect(roomFileContentType("", "track.m4a")).toBe("audio/mp4");
    expect(roomFileContentType("", "notes.txt")).toBe(
      "application/octet-stream"
    );
  });

  it("serves a local File slice as a typed Blob (Safari cannot play SW ReadableStream)", () => {
    const file = new File([new Uint8Array([10, 20, 30, 40, 50, 60])], "clip.mp4", {
      type: "",
    });
    const slice = localFileSlice(file, 2, 5);
    expect(slice).toBeInstanceOf(Blob);
    expect(slice.size).toBe(3);
    expect(slice.type).toBe("video/mp4");
  });

  it("reports an inferred mime for a local File with an empty type", () => {
    const reg = createRoomPlayRegistry();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "clip.mp4", {
      type: "",
    });
    reg.registerLocal("local-mp4", file);
    expect(reg.meta("local-mp4")?.mime).toBe("video/mp4");
  });

  it("caps WebKit media Ranges so each HTTP body is a complete Blob, not a live stream", () => {
    expect(isWebKitMediaEngine("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe(
      true
    );
    expect(
      isWebKitMediaEngine(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
    ).toBe(false);
    expect(
      mediaRangeForBufferedBody({ start: 0, end: 99 }, 100, 16)
    ).toEqual({ start: 0, end: 15 });
    expect(mediaRangeForBufferedBody(null, 100, 16)).toEqual({
      start: 0,
      end: 15,
    });
    expect(SESSION_FILE_PLAY_MEDIA_BLOB_MAX).toBe(2 * 1024 * 1024);
    expect(
      roomFileHttpBodyKind({
        ua: "Version/17.5 Safari/605.1.15",
        mime: "video/mp4",
        local: false,
        destination: "video",
      })
    ).toBe("blob-media");
    expect(
      roomFileHttpBodyKind({
        ua: "Version/17.5 Safari/605.1.15",
        mime: "video/mp4",
        local: false,
        hasRange: true,
      })
    ).toBe("blob-media");
    expect(
      roomFileHttpBodyKind({
        ua: "Version/17.5 Safari/605.1.15",
        mime: "video/mp4",
        local: false,
      })
    ).toBe("stream");
    expect(
      roomFileHttpBodyKind({
        ua: "Chrome/120.0.0.0 Safari/537.36",
        mime: "video/mp4",
        local: false,
        destination: "video",
      })
    ).toBe("stream");
    expect(
      roomFileHttpBodyKind({
        ua: "Version/17.5 Safari/605.1.15",
        mime: "video/mp4",
        local: true,
      })
    ).toBe("blob-local");
  });

  it("caps Chromium play stream Ranges like Safari so scrub does not pin DC to EOF", () => {
    const openEnded = { start: 40 * 1024 * 1024, end: 80 * 1024 * 1024 - 1 };
    const size = 80 * 1024 * 1024;
    expect(
      roomFileServeByteRange({
        range: openEnded,
        size,
        purpose: "play",
        bodyKind: "stream",
      })
    ).toEqual({
      start: 40 * 1024 * 1024,
      end: 40 * 1024 * 1024 + SESSION_FILE_PLAY_MEDIA_BLOB_MAX - 1,
    });
    expect(
      roomFileServeByteRange({
        range: openEnded,
        size,
        purpose: "save",
        bodyKind: "stream",
      })
    ).toEqual(openEnded);
  });

  it("serves a registered local File without DC spans (full GET + Range)", async () => {
    const reg = createRoomPlayRegistry();
    const file = new File([new Uint8Array([10, 20, 30, 40, 50, 60])], "a.bin", {
      type: "application/octet-stream",
    });
    reg.registerLocal("local-1", file);
    expect(reg.meta("local-1")).toMatchObject({
      mime: "application/octet-stream",
      size: 6,
      ended: true,
    });
    expect(Array.from(await readAll(reg.liveBody("local-1")))).toEqual([
      10, 20, 30, 40, 50, 60,
    ]);
    expect(
      Array.from(await readAll(await reg.rangeBody("local-1", { start: 2, end: 4 })))
    ).toEqual([30, 40, 50]);
    reg.unregisterLocal("local-1");
    expect(reg.meta("local-1")).toBeNull();
  });
});
