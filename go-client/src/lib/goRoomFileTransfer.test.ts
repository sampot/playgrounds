import { describe, expect, it, vi } from "vitest";
import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  decodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";

function fileOf(name: string, bytes: number, type = "text/plain"): File {
  return new File([new Uint8Array(bytes).fill(7)], name, { type });
}

describe("createRoomFileTransfer", () => {
  it("rejects blocked, empty, oversized, and concurrent local offers", async () => {
    const json: unknown[] = [];
    const xfer = createRoomFileTransfer({
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "id-1",
    });
    expect((await xfer.offerLocalFile(fileOf("Setup.exe", 10))).ok).toBe(false);
    expect((await xfer.offerLocalFile(fileOf("a.txt", 0))).ok).toBe(false);
    expect(
      (await xfer.offerLocalFile(fileOf("a.bin", SESSION_FILE_MAX_BYTES + 1))).ok
    ).toBe(false);

    const ok = await xfer.offerLocalFile(fileOf("note.txt", 4));
    expect(ok).toEqual({ ok: true, id: "id-1" });
    expect(json[0]).toMatchObject({
      type: SESSION_FILE_TYPE,
      op: "offer",
      name: "note.txt",
      size: 4,
    });
    expect((await xfer.offerLocalFile(fileOf("b.txt", 2))).ok).toBe(false);
  });

  it("does not send chunks until the peer accepts", async () => {
    const json: unknown[] = [];
    const bins: ArrayBuffer[] = [];
    const xfer = createRoomFileTransfer({
      sendJson: (m) => json.push(m),
      sendBinary: (b) => bins.push(b),
      newId: () => "xfer-a",
    });
    await xfer.offerLocalFile(fileOf("clip.txt", 3));
    expect(bins).toHaveLength(0);
    xfer.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "accept",
      id: "xfer-a",
    });
    await vi.waitFor(() => {
      expect(xfer.getState().entries[0]?.status).toBe("done");
    });
    expect(bins.length).toBeGreaterThan(0);
    expect(decodeSessionFileChunk(bins[0]!)?.id).toBe("xfer-a");
    expect(json.some((m) => (m as { op?: string }).op === "done")).toBe(true);
  });

  it("stops outbound when the peer rejects", async () => {
    const bins: ArrayBuffer[] = [];
    const xfer = createRoomFileTransfer({
      sendJson: () => {},
      sendBinary: (b) => bins.push(b),
      newId: () => "xfer-b",
    });
    await xfer.offerLocalFile(fileOf("clip.txt", 8));
    xfer.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "reject",
      id: "xfer-b",
    });
    expect(xfer.getState().entries[0]?.status).toBe("rejected");
    expect(bins).toHaveLength(0);
  });

  it("holds incoming until accept, then assembles a blob", async () => {
    const json: unknown[] = [];
    const urls: string[] = [];
    const xfer = createRoomFileTransfer({
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createObjectUrl: (blob) => {
        urls.push(`blob:${blob.size}`);
        return `blob:${blob.size}`;
      },
      revokeObjectUrl: () => {},
    });
    const payload = new Uint8Array([9, 8, 7]);
    xfer.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "offer",
      id: "in-1",
      name: "pic.png",
      size: 3,
      mime: "image/png",
    });
    expect(xfer.getState().pendingIncoming?.name).toBe("pic.png");
    expect(xfer.acceptIncoming("in-1")).toBe(true);
    expect(json.some((m) => (m as { op?: string }).op === "accept")).toBe(true);

    const { encodeSessionFileChunk } = await import(
      "@pg/roster/rosterSessionFile"
    );
    xfer.onBinary(encodeSessionFileChunk({ id: "in-1", seq: 0, payload }));
    xfer.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "done",
      id: "in-1",
    });
    const done = xfer.getState().entries[0];
    expect(done?.status).toBe("done");
    expect(done?.blobUrl).toBe("blob:3");
    expect(urls).toEqual(["blob:3"]);
  });

  it("rejects a malformed incoming offer without storing it", () => {
    const json: unknown[] = [];
    const xfer = createRoomFileTransfer({
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
    });
    xfer.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "offer",
      id: "bad",
      name: "virus.exe",
      size: 12,
    });
    expect(xfer.getState().entries).toHaveLength(0);
    expect(json[0]).toMatchObject({ op: "reject", id: "bad" });
  });
});
