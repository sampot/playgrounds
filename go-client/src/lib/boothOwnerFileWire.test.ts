import { describe, expect, it } from "vitest";
import {
  BOOTH_OWNER_CHUNK_BYTES,
  BOOTH_OWNER_SCTP_MAX_MESSAGE,
  base64ToBytes,
  bytesToBase64,
  encodeOwnerChunk,
  isRtcDataChannelQueueFullError,
  parseOwnerChunkMessage,
  readFileInChunks,
  waitForOwnerDcDrain,
  waitForOpenOwnerDataChannel,
} from "./boothOwnerFileWire";

describe("boothOwnerFileWire", () => {
  it("detects RTCDataChannel queue full errors", () => {
    expect(
      isRtcDataChannelQueueFullError(
        new Error(
          "Failed to execute 'send' on 'RTCDataChannel': RTCDataChannel send queue is full"
        )
      )
    ).toBe(true);
  });

  it("waits until owner DC buffered amount drops", async () => {
    let amount = 128 * 1024;
    const pending = waitForOwnerDcDrain(() => amount, 64 * 1024);
    setTimeout(() => {
      amount = 0;
    }, 32);
    await pending;
    expect(amount).toBe(0);
  });

  it("waitForOpenOwnerDataChannel resolves when dc opens", async () => {
    const dc = {
      readyState: "connecting",
    } as RTCDataChannel;
    const pending = waitForOpenOwnerDataChannel(() => dc, 500);
    setTimeout(() => {
      Object.defineProperty(dc, "readyState", { value: "open" });
    }, 40);
    await expect(pending).resolves.toBe(dc);
  });

  it("keeps encoded owner chunks under SCTP max-message-size", () => {
    const payload = new Uint8Array(BOOTH_OWNER_CHUNK_BYTES).fill(0xab);
    const raw = encodeOwnerChunk({
      type: "booth.owner.chunk",
      v: 1,
      transferId: "transfer-max-size-check",
      seq: 0,
      data: bytesToBase64(payload),
    });
    expect(raw.length).toBeLessThan(BOOTH_OWNER_SCTP_MAX_MESSAGE);
  });

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
