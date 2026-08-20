import { describe, expect, it } from "vitest";
import {
  createRoomPlayRegistry,
  parseByteRange,
  parseRoomPlayPath,
  playFetchRange,
  roomPlayPath,
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

describe("room play path", () => {
  it("round-trips a transfer id", () => {
    expect(roomPlayPath("tr-1")).toBe("/room-play/tr-1");
    expect(parseRoomPlayPath("/room-play/tr-1")).toBe("tr-1");
    expect(parseRoomPlayPath("/room/tr-1")).toBeNull();
  });
});

describe("playFetchRange", () => {
  it("turns an unranged GET of a known-size file into a whole-file range", () => {
    expect(playFetchRange(null, 400 * 1024 * 1024)).toEqual({
      start: 0,
      end: 400 * 1024 * 1024 - 1,
    });
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
});
