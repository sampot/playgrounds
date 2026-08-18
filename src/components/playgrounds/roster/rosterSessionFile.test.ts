import { describe, expect, it } from "vitest";
import {
  SESSION_FILE_CHUNK_PAYLOAD_MAX,
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  assembleSessionFileChunks,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
  isBlockedSessionFileName,
  isSessionFileControl,
  normalizeSessionFileOffer,
  sessionFileChunkCount,
} from "./rosterSessionFile";

describe("session_file control", () => {
  it("accepts a well-formed offer under the size cap", () => {
    const offer = normalizeSessionFileOffer({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "offer",
      id: "xfer-1",
      name: "clip.mp4",
      size: 1024,
      mime: "video/mp4",
    });
    expect(offer).toEqual({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "offer",
      id: "xfer-1",
      name: "clip.mp4",
      size: 1024,
      mime: "video/mp4",
    });
    expect(isSessionFileControl(offer)).toBe(true);
  });

  it("rejects blank, oversized, or malformed offers", () => {
    expect(
      normalizeSessionFileOffer({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "offer",
        id: "x",
        name: "a.bin",
        size: SESSION_FILE_MAX_BYTES + 1,
      })
    ).toBeNull();
    expect(
      normalizeSessionFileOffer({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "offer",
        id: "",
        name: "a.bin",
        size: 10,
      })
    ).toBeNull();
    expect(isSessionFileControl({ type: "session_chat" })).toBe(false);
  });

  it("blocks typical executable names", () => {
    expect(isBlockedSessionFileName("Setup.exe")).toBe(true);
    expect(isBlockedSessionFileName("note.APK")).toBe(true);
    expect(isBlockedSessionFileName("photo.jpg")).toBe(false);
  });
});

describe("session_file chunks", () => {
  it("round-trips a binary chunk frame", () => {
    const payload = new Uint8Array([1, 2, 3, 9]);
    const frame = encodeSessionFileChunk({
      id: "xfer-1",
      seq: 0,
      payload,
    });
    expect(decodeSessionFileChunk(frame)).toEqual({
      id: "xfer-1",
      seq: 0,
      payload,
    });
  });

  it("rejects unknown binary frames", () => {
    expect(decodeSessionFileChunk(new Uint8Array([0, 1, 2]).buffer)).toBeNull();
  });

  it("assembles chunks in seq order and counts them", () => {
    const parts = [new Uint8Array([1, 2]), new Uint8Array([3])];
    expect(sessionFileChunkCount(3, SESSION_FILE_CHUNK_PAYLOAD_MAX)).toBe(1);
    const frames = parts.map((payload, seq) =>
      encodeSessionFileChunk({ id: "a", seq, payload })
    );
    const blob = assembleSessionFileChunks(
      frames.map(f => decodeSessionFileChunk(f)!)
    );
    expect(Array.from(new Uint8Array(blob))).toEqual([1, 2, 3]);
  });
});
