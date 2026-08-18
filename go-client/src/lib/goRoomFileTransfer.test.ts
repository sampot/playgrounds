import { describe, expect, it, vi } from "vitest";
import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import type { RoomFileWritable } from "./goRoomFileSave";

function fileOf(name: string, bytes: number, type = "text/plain"): File {
  return new File([new Uint8Array(bytes).fill(7)], name, { type });
}

function mockWritable() {
  const chunks: Uint8Array[] = [];
  let closed = false;
  const writable: RoomFileWritable = {
    write: (data) => {
      if (data instanceof Uint8Array) {
        chunks.push(new Uint8Array(data));
        return;
      }
      if (data instanceof ArrayBuffer) {
        chunks.push(new Uint8Array(data));
        return;
      }
      const view = data as ArrayBufferView;
      chunks.push(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
      );
    },
    close: () => {
      closed = true;
    },
    abort: () => {
      closed = true;
    },
  };
  return { writable, chunks, isClosed: () => closed };
}

describe("createRoomFileTransfer", () => {
  it("shares metadata only and allows a second listing", async () => {
    const json: unknown[] = [];
    const bins: ArrayBuffer[] = [];
    let n = 0;
    const xfer = createRoomFileTransfer({
      localAgentId: "host-1",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: (b) => bins.push(b),
      newId: () => `id-${++n}`,
    });
    expect((await xfer.shareLocalFile(fileOf("Setup.exe", 10))).ok).toBe(false);
    expect((await xfer.shareLocalFile(fileOf("a.txt", 0))).ok).toBe(false);
    expect(
      (await xfer.shareLocalFile(fileOf("a.bin", SESSION_FILE_MAX_BYTES + 1))).ok
    ).toBe(false);

    const ok = await xfer.shareLocalFile(fileOf("note.txt", 4));
    expect(ok).toEqual({ ok: true, id: "id-1" });
    expect(bins).toHaveLength(0);
    expect(json[0]).toMatchObject({
      type: SESSION_FILE_TYPE,
      op: "share",
      name: "note.txt",
      size: 4,
      owner: "host-1",
      ownerName: "太郎",
    });
    expect((await xfer.shareLocalFile(fileOf("b.txt", 2))).ok).toBe(true);
    expect(xfer.getState().entries).toHaveLength(2);
  });

  it("does not request when the save picker is cancelled", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-a",
      name: "clip.txt",
      size: 3,
      owner: "h",
      ownerName: "太郎",
    });
    const out = await guest.download("file-a", async () => null);
    expect(out).toMatchObject({ ok: false, cancelled: true });
    expect(json.some((m) => (m as { op?: string }).op === "request")).toBe(
      false
    );
  });

  it("streams slices to a writable after request, without assembling a blob", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => guest.onControl(m),
      sendBinary: (b) => guest.onBinary(b),
      newId: () => "file-1",
    });
    guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => owner.onControl(m),
      sendBinary: () => {},
      newId: () => "tr-1",
    });

    await owner.shareLocalFile(fileOf("clip.txt", 3));
    expect(guest.getState().entries[0]?.name).toBe("clip.txt");

    const sink = mockWritable();
    const started = await guest.download("file-1", async () => sink.writable);
    expect(started.ok).toBe(true);

    await vi.waitFor(() => {
      expect(sink.isClosed()).toBe(true);
    });
    const received = sink.chunks.reduce((n, c) => n + c.byteLength, 0);
    expect(received).toBe(3);
    expect(guest.getState().entries[0]).not.toHaveProperty("blobUrl");
  });

  it("rejects a second download while a transfer is in flight", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "tr-1",
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "a",
      name: "a.txt",
      size: 8,
      owner: "h",
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "b",
      name: "b.txt",
      size: 8,
      owner: "h",
    });
    const sink = mockWritable();
    expect((await guest.download("a", async () => sink.writable)).ok).toBe(true);
    expect((await guest.download("b", async () => sink.writable)).ok).toBe(
      false
    );
  });
});
