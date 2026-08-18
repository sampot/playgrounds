import { describe, expect, it } from "vitest";
import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
  isBlockedSessionFileName,
  isSessionFileBroadcastOp,
  isSessionFileControl,
  normalizeSessionFileShare,
  sessionFileChunkCount,
} from "./rosterSessionFile";

describe("session_file control", () => {
  it("accepts a well-formed share under the size cap", () => {
    const share = normalizeSessionFileShare({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 1024,
      mime: "video/mp4",
      owner: "host-1",
      ownerName: "太郎",
    });
    expect(share).toEqual({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 1024,
      mime: "video/mp4",
      owner: "host-1",
      ownerName: "太郎",
    });
    expect(isSessionFileControl(share)).toBe(true);
    expect(isSessionFileBroadcastOp("share")).toBe(true);
    expect(isSessionFileBroadcastOp("request")).toBe(false);
  });

  it("rejects blank, oversized, executable, or ownerless shares", () => {
    expect(
      normalizeSessionFileShare({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "share",
        id: "x",
        name: "a.bin",
        size: SESSION_FILE_MAX_BYTES + 1,
        owner: "h",
      })
    ).toBeNull();
    expect(
      normalizeSessionFileShare({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "share",
        id: "x",
        name: "Setup.exe",
        size: 10,
        owner: "h",
      })
    ).toBeNull();
    expect(
      normalizeSessionFileShare({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "share",
        id: "x",
        name: "a.bin",
        size: 10,
      })
    ).toBeNull();
    expect(isSessionFileControl({ type: "session_chat" })).toBe(false);
    expect(
      isSessionFileControl({
        type: SESSION_FILE_TYPE,
        v: 1,
        op: "offer",
        id: "old",
      })
    ).toBe(false);
  });

  it("blocks typical executable names", () => {
    expect(isBlockedSessionFileName("Setup.exe")).toBe(true);
    expect(isBlockedSessionFileName("note.APK")).toBe(true);
    expect(isBlockedSessionFileName("photo.jpg")).toBe(false);
  });
});

describe("session_file chunks", () => {
  it("round-trips a binary chunk keyed by transferId", () => {
    const payload = new Uint8Array([1, 2, 3, 9]);
    const frame = encodeSessionFileChunk({
      transferId: "tr-1",
      seq: 0,
      payload,
    });
    expect(decodeSessionFileChunk(frame)).toEqual({
      transferId: "tr-1",
      seq: 0,
      payload,
    });
    expect(sessionFileChunkCount(3, 16 * 1024)).toBe(1);
  });

  it("rejects unknown binary frames", () => {
    expect(decodeSessionFileChunk(new Uint8Array([0, 1, 2]).buffer)).toBeNull();
  });
});
