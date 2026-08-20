import { describe, expect, it, vi } from "vitest";
import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import { createPlayByteWindow, createRegistryPlaySink } from "./goRoomFilePlay";
import { createRoomPlayRegistry, parseRoomPlayPath } from "./goRoomPlayRegistry";
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
      expect(guest.getState().playback?.url).toBe("/room-play/file-1");
    });
    expect(guest.getState().playback?.name).toBe("clip.mp4");
    expect(guest.getState().playback?.kind).toBe("video");
  });

  it("keeps the same playback object while remote play chunks arrive", async () => {
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "clip",
      name: "clip.mp4",
      size: 8,
      mime: "video/mp4",
      owner: "h",
    });
    const seen: { url: string }[] = [];
    guest.subscribe((s) => {
      if (s.playback) seen.push(s.playback);
    });
    expect((await guest.play("clip")).ok).toBe(true);
    const first = seen[seen.length - 1];
    expect(first?.url).toBe(sink.url);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "tr-1",
        seq: 0,
        payload: new Uint8Array(4),
      })
    );
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "tr-1",
        seq: 1,
        payload: new Uint8Array(4),
      })
    );
    expect(seen[seen.length - 1]).toBe(first);
  });

  it("starts playing a file larger than 256 MiB without buffering the whole file", async () => {
    const sink = createPlayByteWindow({
      maxBytes: 64,
      highBytes: 48,
      lowBytes: 16,
      mime: "video/mp4",
    });
    const json: unknown[] = [];
    let n = 0;
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
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
    const startRequests = json.filter(
      (m) => (m as { op?: string }).op === "request"
    );
    expect(startRequests).toHaveLength(1);
    expect(startRequests[0]).toMatchObject({ offset: 0 });
    const transferId = (
      startRequests[0] as { transferId: string }
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

  it("starts remote play at offset 0 only; a far seek opens a second Range", async () => {
    const json: unknown[] = [];
    let n = 0;
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "big",
      name: "movie.mp4",
      size: 80 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("big")).ok).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
    expect(json[0]).toMatchObject({ offset: 0, transferId: "tr-1" });
    expect((await guest.seekPlay(64 * 1024)).ok).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
    expect((await guest.seekPlay(2 * 1024 * 1024)).ok).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
    expect((await guest.seekPlay(40 * 1024 * 1024)).ok).toBe(true);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      offset: 40 * 1024 * 1024,
      transferId: "tr-2",
    });
  });

  it("drops the farther play Range when a third seek arrives", async () => {
    const json: unknown[] = [];
    let n = 0;
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "big",
      name: "movie.mp4",
      size: 200 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("big")).ok).toBe(true);
    expect((await guest.seekPlay(40 * 1024 * 1024)).ok).toBe(true);
    expect((await guest.seekPlay(80 * 1024 * 1024)).ok).toBe(true);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(
      json.filter((m) => (m as { op?: string }).op === "cancel").length
    ).toBeGreaterThanOrEqual(1);
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
    expect((await guest.seekPlay(20)).ok).toBe(true);
    expect(ownerJson.some((m) => (m as { op?: string }).op === "resume")).toBe(
      true
    );
    expect(
      ownerJson.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
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

  it("lets the owner download their own hanging file without a peer request", async () => {
    const json: unknown[] = [];
    const xfer = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "file-1",
    });
    expect((await xfer.shareLocalFile(fileOf("note.txt", 4))).ok).toBe(true);
    const sink = mockWritable();
    expect((await xfer.download("file-1", async () => sink.writable)).ok).toBe(
      true
    );
    expect(json.some((m) => (m as { op?: string }).op === "request")).toBe(
      false
    );
    expect(sink.isClosed()).toBe(true);
    expect(sink.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(4);
  });

  it("lets a host drop someone else's listing and tells the owner to forget it", async () => {
    const ownerJson: unknown[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => ownerJson.push(m),
      sendBinary: () => {},
      newId: () => "file-1",
    });
    expect((await owner.shareLocalFile(fileOf("clip.mp4", 8, "video/mp4"))).ok).toBe(
      true
    );
    const host = createRoomFileTransfer({
      localAgentId: "h",
      localName: "主持",
      sendJson: (m) => owner.onControl(m),
      sendBinary: () => {},
    });
    host.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 8,
      mime: "video/mp4",
      owner: "g",
      ownerName: "訪客",
    });
    expect(host.unshare("file-1", { host: true })).toBe(true);
    expect(host.getState().entries).toHaveLength(0);
    expect(owner.getState().entries).toHaveLength(0);
    expect(owner.localFile("file-1")).toBeNull();
  });

  it("opens a local image as an image preview, not a video sink", async () => {
    const xfer = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "pic-1",
    });
    const pic = fileOf("shot.png", 6, "image/png");
    expect((await xfer.shareLocalFile(pic)).ok).toBe(true);
    expect((await xfer.play("pic-1")).ok).toBe(true);
    expect(xfer.getState().playback).toMatchObject({
      id: "pic-1",
      kind: "image",
      name: "shot.png",
    });
  });

  it("pumps a request from a byte offset instead of the start of the file", async () => {
    const firstBytes: number[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: (buf) => {
        const chunk = decodeSessionFileChunk(buf);
        if (chunk && firstBytes.length === 0 && chunk.payload.byteLength) {
          firstBytes.push(chunk.payload[0]!);
        }
      },
      newId: () => "file-1",
    });
    const clip = new File([new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17])], "clip.mp4", {
      type: "video/mp4",
    });
    await owner.shareLocalFile(clip);
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-1",
      from: "g",
      offset: 4,
    });
    await vi.waitFor(() => {
      expect(firstBytes).toEqual([14]);
    });
  });

  it("pumps two offsets of the same file at once", async () => {
    const log: string[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => {
        if ((m as { op?: string }).op === "done") {
          log.push(`done:${(m as { transferId: string }).transferId}`);
        }
      },
      sendBinary: (buf) => {
        const chunk = decodeSessionFileChunk(buf);
        if (chunk) log.push(`chunk:${chunk.transferId}`);
      },
      newId: () => "file-1",
    });
    const clip = new File([new Uint8Array(64 * 1024).fill(1)], "clip.mp4", {
      type: "video/mp4",
    });
    await owner.shareLocalFile(clip);
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-head",
      from: "g",
      offset: 0,
    });
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-tail",
      from: "g",
      offset: 32 * 1024,
    });
    await vi.waitFor(() => {
      expect(log.some((e) => e === "chunk:tr-head")).toBe(true);
      expect(log.some((e) => e === "chunk:tr-tail")).toBe(true);
    });
    const firstTail = log.indexOf("chunk:tr-tail");
    const doneHead = log.indexOf("done:tr-head");
    expect(firstTail).toBeGreaterThanOrEqual(0);
    if (doneHead >= 0) expect(firstTail).toBeLessThan(doneHead);
  });

  it("retargets a remote play transfer when the player seeks far ahead", async () => {
    const json: unknown[] = [];
    let n = 0;
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "clip",
      name: "clip.mp4",
      size: 80 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("clip")).ok).toBe(true);
    expect((await guest.seekPlay(40 * 1024 * 1024)).ok).toBe(true);
    expect(guest.getState().playback?.url).toBe(sink.url);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ offset: 0, transferId: "tr-1" });
    expect(requests[1]).toMatchObject({
      offset: 40 * 1024 * 1024,
      transferId: "tr-2",
    });
  });

  it("keeps play received from going backwards on a far seek", async () => {
    const json: unknown[] = [];
    let n = 0;
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: () =>
        createPlayByteWindow({
          mime: "video/mp4",
          maxBytes: 64,
          highBytes: 48,
          lowBytes: 8,
        }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "big",
      name: "movie.mp4",
      size: 80 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("big")).ok).toBe(true);
    const headId = (
      json.find((m) => (m as { op?: string }).op === "request") as {
        transferId: string;
      }
    ).transferId;
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: headId,
        seq: 0,
        payload: new Uint8Array(40),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(40);
    });
    expect((await guest.seekPlay(40 * 1024 * 1024)).ok).toBe(true);
    expect(guest.getState().entries[0]?.received).toBe(40 * 1024 * 1024);
    const seekId = (
      json.filter((m) => (m as { op?: string }).op === "request").at(-1) as {
        transferId: string;
      }
    ).transferId;
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: seekId,
        seq: 0,
        payload: new Uint8Array(16),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(40 * 1024 * 1024 + 16);
    });
  });

  it("does not open a new Range for every sequential need past the frontier", async () => {
    const json: unknown[] = [];
    let n = 0;
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: () => createPlayByteWindow({ mime: "video/mp4" }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "big",
      name: "movie.mp4",
      size: 80 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("big")).ok).toBe(true);
    for (let at = 512 * 1024; at <= 2 * 1024 * 1024; at += 512 * 1024) {
      expect((await guest.seekPlay(at)).ok).toBe(true);
    }
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
  });

  it("does not advance play received when the sink rejects an out-of-window chunk", async () => {
    const json: unknown[] = [];
    let n = 0;
    const sessions = createRoomPlayRegistry();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => `tr-${++n}`,
      createPlaySink: (opts) =>
        createRegistryPlaySink({
          ...opts,
          maxBytes: 16,
          highBytes: 12,
          lowBytes: 4,
          sessions,
        }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "clip",
      name: "clip.mp4",
      size: 100,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("clip")).ok).toBe(true);
    const playId = parseRoomPlayPath(guest.getState().playback?.url ?? "");
    expect(playId).toBeTruthy();
    sessions.pin(playId!, "r0", 0);
    const transferId = (
      json.find((m) => (m as { op?: string }).op === "request") as {
        transferId: string;
      }
    ).transferId;
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 0,
        payload: new Uint8Array(8).fill(1),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(8);
    });
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 1,
        payload: new Uint8Array(8).fill(2),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(16);
    });
    guest.onBinary(
      encodeSessionFileChunk({
        transferId,
        seq: 2,
        payload: new Uint8Array(8).fill(3),
      })
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(guest.getState().entries[0]?.received).toBe(16);
    expect(sessions.covers(playId!, 16, 24)).toBe(false);
    expect(json.some((m) => (m as { op?: string }).op === "pause")).toBe(true);
  });
});
