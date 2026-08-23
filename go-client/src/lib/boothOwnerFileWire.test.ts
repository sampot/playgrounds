import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
  encodeOwnerChunk,
  parseOwnerChunkMessage,
  readFileInChunks,
} from "./boothOwnerFileWire";

describe("boothOwnerFileWire", () => {
  it("round-trips owner chunk JSON", () => {
    const raw = encodeOwnerChunk({
      type: "booth.owner.chunk",
      v: 1,
      transferId: "t1",
      seq: 2,
      data: bytesToBase64(new Uint8Array([1, 2, 3])),
    });
    const parsed = parseOwnerChunkMessage(raw);
    expect(parsed).toMatchObject({
      type: "booth.owner.chunk",
      transferId: "t1",
      seq: 2,
    });
    expect(base64ToBytes(parsed!.data!)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("splits a blob into bounded chunks", async () => {
    const file = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
    const chunks: Array<{ seq: number; len: number; eof: boolean }> = [];
    await readFileInChunks(file, 2, async (bytes, seq, eof) => {
      chunks.push({ seq, len: bytes.length, eof });
    });
    expect(chunks).toEqual([
      { seq: 0, len: 2, eof: false },
      { seq: 1, len: 2, eof: false },
      { seq: 2, len: 1, eof: true },
    ]);
  });
});
