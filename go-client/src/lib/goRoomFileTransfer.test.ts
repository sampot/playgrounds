import { describe, expect, it, vi } from "vitest";
import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  encodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import { createPlayByteWindow } from "./goRoomFilePlay";
import { GO_ROOM_HANG_FILES_ONLY } from "./goRoom";
import type { RoomFileWritable } from "./goRoomFileSave";

function fileOf(name: string, bytes: number, type = "text/plain"): File {
  return new File([new Uint8Array(bytes).fill(7)], name, { type });
}

/** Declared size only — do not allocate the cap (2 GiB) in tests. */
function fileClaimingSize(name: string, size: number): File {
  const file = new File([new Uint8Array(1).fill(7)], name, {
    type: "application/octet-stream",
  });
  Object.defineProperty(file, "size", { get: () => size });
  return file;
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
      (await xfer.shareLocalFile(fileClaimingSize("a.bin", SESSION_FILE_MAX_BYTES + 1))).ok
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

  it("tags outbound chunks with the requester so mesh can skip the Host", async () => {
    const dests: (string | undefined)[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "g-a",
      localName: "甲",
      sendJson: () => {},
      sendBinary: (_buf, destPeerId) => {
        dests.push(destPeerId);
      },
      newId: () => "file-1",
    });
    await owner.shareLocalFile(fileOf("note.txt", 2));
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-1",
      from: "g-b",
    });
    await vi.waitFor(() => {
      expect(dests.length).toBeGreaterThan(0);
    });
    expect(dests.every((d) => d === "g-b")).toBe(true);
  });

  it("refuses to hang a directory listing", async () => {
    const json: unknown[] = [];
    const xfer = createRoomFileTransfer({
      localAgentId: "host-1",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
    });
    const a = new File([new Uint8Array(4).fill(1)], "a.txt", {
      type: "text/plain",
    });
    const b = new File([new Uint8Array(2).fill(2)], "b.txt", {
      type: "text/plain",
    });
    Object.defineProperty(a, "webkitRelativePath", { value: "album/a.txt" });
    Object.defineProperty(b, "webkitRelativePath", { value: "album/b.txt" });
    const ok = await xfer.shareLocalDirectory([a, b]);
    expect(ok.ok).toBe(false);
    expect(ok).toMatchObject({ error: GO_ROOM_HANG_FILES_ONLY });
    expect(json).toHaveLength(0);
    expect(xfer.getState().entries).toHaveLength(0);
  });

  it("hangs folder-dropped files as independent files", async () => {
    const json: unknown[] = [];
    let n = 0;
    const xfer = createRoomFileTransfer({
      localAgentId: "host-1",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `id-${++n}`,
    });
    const a = new File([new Uint8Array(4).fill(1)], "a.txt", {
      type: "text/plain",
    });
    const b = new File([new Uint8Array(2).fill(2)], "b.txt", {
      type: "text/plain",
    });
    Object.defineProperty(a, "webkitRelativePath", { value: "album/a.txt" });
    Object.defineProperty(b, "webkitRelativePath", { value: "album/b.txt" });
    expect((await xfer.shareLocalFile(a)).ok).toBe(true);
    expect((await xfer.shareLocalFile(b)).ok).toBe(true);
    expect(json).toHaveLength(2);
    expect(
      json.every((m) => (m as { kind?: string }).kind !== "dir")
    ).toBe(true);
    expect(xfer.getState().entries).toHaveLength(2);
  });

  it("rejects downloading a directory listing", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "dir-1",
      name: "album",
      size: 0,
      owner: "h",
      kind: "dir",
    });
    expect(guest.getState().entries).toHaveLength(0);
    const out = await guest.download("dir-1", async () => {
      throw new Error("should not open picker");
    });
    expect(out.ok).toBe(false);
  });

  it("plays a remote video into a local object URL without a save picker", async () => {
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

    const clip = fileOf("clip.mp4", 4, "video/mp4");
    await owner.shareLocalFile(clip);
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(guest.getState().playback?.id).toBe("file-1");
    await vi.waitFor(() => {
      expect(guest.getState().playback?.url).toMatch(/^blob:/);
    });
    expect(guest.getState().playback?.name).toBe("clip.mp4");
    expect(guest.getState().playback?.kind).toBe("video");
  });

  it("starts playing a file larger than 256 MiB without buffering the whole file", async () => {
    const sink = createPlayByteWindow({
      maxBytes: 64,
      highBytes: 48,
      lowBytes: 16,
      mime: "video/mp4",
    });
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "big",
      name: "movie.mp4",
      size: 400 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("big")).ok).toBe(true);
    expect(guest.getState().playback?.id).toBe("big");
    const transferId = (
      json.find((m) => (m as { op?: string }).op === "request") as {
        transferId: string;
      }
    ).transferId;
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 0,
        payload: new Uint8Array(20),
      })
    );
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 1,
        payload: new Uint8Array(20),
      })
    );
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 2,
        payload: new Uint8Array(20),
      })
    );
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 3,
        payload: new Uint8Array(20),
      })
    );
    await vi.waitFor(() => {
      expect(sink.bufferedBytes()).toBeGreaterThan(0);
    });
    expect(sink.bufferedBytes()).toBeLessThanOrEqual(64);
  });

  it("pauses the owner when the play window is full", async () => {
    const sink = createPlayByteWindow({
      maxBytes: 32,
      highBytes: 16,
      lowBytes: 8,
      mime: "video/mp4",
    });
    const ownerJson: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => ownerJson.push(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 64,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("file-1")).ok).toBe(true);
    const transferId = (
      ownerJson.find((m) => (m as { op?: string }).op === "request") as {
        transferId: string;
      }
    ).transferId;
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 0,
        payload: new Uint8Array(20),
      })
    );
    await vi.waitFor(() => {
      expect(
        ownerJson.some((m) => (m as { op?: string }).op === "pause")
      ).toBe(true);
    });
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
