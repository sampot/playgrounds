/**
 * Multi-guest 包廂傳檔 e2e（in-process）：Host star hub + ≥2 Guest transfers.
 * Mirrors roomRuntime file wiring without WebRTC.
 */
import { describe, expect, it, vi } from "vitest";
import { createRoomFileStarHub } from "./goRoomFileStar";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import { createRegistryPlaySink } from "./goRoomFilePlay";
import {
  createRoomPlayRegistry,
  parseRoomFilePath,
  parseRoomFilePurpose,
} from "./goRoomPlayRegistry";
import type { RoomFileWritable } from "./goRoomFileSave";

function fileOf(name: string, bytes: number, fill = 7): File {
  return new File([new Uint8Array(bytes).fill(fill)], name, {
    type: "text/plain",
  });
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

/** Same in-process `/room-file/` façade as goRoomFileTransfer.test.ts */
function httpFacade() {
  const sessions = createRoomPlayRegistry();
  let trN = 0;
  let openHandler:
    | ((msg: {
        fileId: string;
        transferId: string;
        offset: number;
        end?: number;
        purpose?: "play" | "save";
      }) => void)
    | null = null;
  let endHandler:
    | ((msg: {
        fileId: string;
        transferId: string;
        ok: boolean;
        delivered?: number;
        reason?: string;
      }) => void)
    | null = null;

  function watchBody(
    fileId: string,
    transferId: string,
    body: ReadableStream<Uint8Array>,
    expectLen: number
  ): ReadableStream<Uint8Array> {
    const reader = body.getReader();
    let delivered = 0;
    let settled = false;
    const settle = (ok: boolean, reason?: string) => {
      if (settled) return;
      settled = true;
      endHandler?.({ fileId, transferId, ok, delivered, reason });
    };
    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            if (expectLen > 0 && delivered < expectLen) {
              settle(false, "incomplete");
              controller.error(new Error("incomplete file body"));
              return;
            }
            settle(true);
            controller.close();
            return;
          }
          if (value?.byteLength) {
            delivered += value.byteLength;
            controller.enqueue(value);
          }
        } catch (e) {
          settle(false, "aborted");
          controller.error(e);
        }
      },
      cancel() {
        settle(false, "cancelled");
        void reader.cancel();
      },
    });
  }

  return {
    onOpenTransfer(
      handler: (msg: {
        fileId: string;
        transferId: string;
        offset: number;
        end?: number;
        purpose?: "play" | "save";
      }) => void
    ) {
      openHandler = handler;
    },
    onTransferEnd(
      handler: (msg: {
        fileId: string;
        transferId: string;
        ok: boolean;
        delivered?: number;
        reason?: string;
      }) => void
    ) {
      endHandler = handler;
    },
    createPlaySink: (opts: {
      mime?: string;
      name?: string;
      size?: number;
      playId?: string;
      mode?: "play" | "save";
    }) => createRegistryPlaySink({ ...opts, sessions }),
    fetchRoomFile: async (url: string) => {
      const id = parseRoomFilePath(new URL(url, "http://go.local").pathname);
      if (!id) return new Response(null, { status: 404 });
      let meta = sessions.meta(id);
      for (let i = 0; i < 100 && !meta; i++) {
        await new Promise((r) => setTimeout(r, 5));
        meta = sessions.meta(id);
      }
      if (!meta || meta.size <= 0) {
        return new Response(null, { status: 404 });
      }
      const transferId = `sw-tr-${++trN}`;
      const purpose = parseRoomFilePurpose(
        new URL(url, "http://go.local").search
      );
      openHandler?.({
        fileId: id,
        transferId,
        offset: 0,
        end: meta.size - 1,
        purpose,
      });
      const raw = await sessions.rangeBody(id, {
        start: 0,
        end: meta.size - 1,
      });
      const body = watchBody(id, transferId, raw, meta.size);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": meta.mime,
          "Content-Range": `bytes 0-${meta.size - 1}/${meta.size}`,
          "Content-Length": String(meta.size),
        },
      });
    },
  };
}

function wireHttp(
  http: ReturnType<typeof httpFacade>,
  guest: ReturnType<typeof createRoomFileTransfer>
) {
  http.onOpenTransfer((msg) => guest.acceptHttpTransfer(msg));
  http.onTransferEnd((msg) => guest.noteHttpTransferEnd(msg));
}

function listingOwner(
  xfers: Array<ReturnType<typeof createRoomFileTransfer>>,
  fileId: string
): string | null {
  for (const x of xfers) {
    const e = x.getState().entries.find((row) => row.id === fileId);
    if (e?.ownerId) return e.ownerId;
  }
  return null;
}

describe("multi-guest booth file e2e (star hub)", () => {
  it("Host share → both Guests list and download the same bytes", async () => {
    const httpB = httpFacade();
    const httpC = httpFacade();
    let host!: ReturnType<typeof createRoomFileTransfer>;
    let guestB!: ReturnType<typeof createRoomFileTransfer>;
    let guestC!: ReturnType<typeof createRoomFileTransfer>;
    let ids = 0;
    let trB = 0;
    let trC = 0;

    const hub = createRoomFileStarHub({
      localAgentId: "host",
      listingOwner: (id) => listingOwner([host, guestB, guestC], id),
      catalogItems: () => host.catalogItems(),
      applyControl: (data) => host.onControl(data),
      applyBinary: (buf) => host.onBinary(buf),
      forgetOwner: (ownerId) => host.forgetOwner(ownerId),
    });

    host = createRoomFileTransfer({
      localAgentId: "host",
      localName: "主持",
      sendJson: (msg) => hub.outboundControl(msg),
      sendBinary: (buf) => hub.outboundBinary(buf),
      bufferedAmount: (dest) => hub.requesterBufferedAmount(dest),
      newId: () => `f-${++ids}`,
    });
    guestB = createRoomFileTransfer({
      localAgentId: "peer-b",
      localName: "G1",
      sendJson: (msg) => hub.onPeerControl("peer-b", msg),
      sendBinary: () => {},
      newId: () => `tr-b-${++trB}`,
      createPlaySink: httpB.createPlaySink,
      fetchRoomFile: (url) => httpB.fetchRoomFile(url),
    });
    guestC = createRoomFileTransfer({
      localAgentId: "peer-c",
      localName: "G2",
      sendJson: (msg) => hub.onPeerControl("peer-c", msg),
      sendBinary: () => {},
      newId: () => `tr-c-${++trC}`,
      createPlaySink: httpC.createPlaySink,
      fetchRoomFile: (url) => httpC.fetchRoomFile(url),
    });
    wireHttp(httpB, guestB);
    wireHttp(httpC, guestC);

    hub.addPeer({
      peerId: "peer-b",
      sendJson: (m) => guestB.onControl(m),
      sendBinary: (b) => guestB.onBinary(b),
      bufferedAmount: () => 0,
    });
    hub.addPeer({
      peerId: "peer-c",
      sendJson: (m) => guestC.onControl(m),
      sendBinary: (b) => guestC.onBinary(b),
      bufferedAmount: () => 0,
    });

    const shared = await host.shareLocalFile(fileOf("note.txt", 6, 42));
    expect(shared.ok).toBe(true);
    expect(guestB.getState().entries).toHaveLength(1);
    expect(guestC.getState().entries).toHaveLength(1);
    expect(guestB.getState().entries[0]?.name).toBe("note.txt");
    expect(guestC.getState().entries[0]?.ownerName).toBe("主持");

    const fileId = shared.ok ? shared.id : "";
    const sinkB = mockWritable();
    const dlB = await guestB.download(fileId, async () => sinkB.writable);
    if (!dlB.ok) expect.fail(`G1 download: ${"error" in dlB ? dlB.error : "?"}`);
    await vi.waitFor(() => expect(sinkB.isClosed()).toBe(true));
    expect(sinkB.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(6);
    expect(sinkB.chunks[0]?.[0]).toBe(42);

    const sinkC = mockWritable();
    const dlC = await guestC.download(fileId, async () => sinkC.writable);
    if (!dlC.ok) expect.fail(`G2 download: ${"error" in dlC ? dlC.error : "?"}`);
    await vi.waitFor(() => expect(sinkC.isClosed()).toBe(true));
    expect(sinkC.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(6);
    expect(sinkC.chunks[0]?.[0]).toBe(42);
  });

  it("Guest-owned share → other Guest downloads via Host star", async () => {
    const httpC = httpFacade();
    let host!: ReturnType<typeof createRoomFileTransfer>;
    let guestB!: ReturnType<typeof createRoomFileTransfer>;
    let guestC!: ReturnType<typeof createRoomFileTransfer>;
    let ids = 0;
    let trC = 0;

    const hub = createRoomFileStarHub({
      localAgentId: "host",
      listingOwner: (id) => listingOwner([host, guestB, guestC], id),
      catalogItems: () => host.catalogItems(),
      applyControl: (data) => host.onControl(data),
      applyBinary: (buf) => host.onBinary(buf),
      forgetOwner: (ownerId) => host.forgetOwner(ownerId),
    });

    host = createRoomFileTransfer({
      localAgentId: "host",
      localName: "主持",
      sendJson: (msg) => hub.outboundControl(msg),
      sendBinary: (buf) => hub.outboundBinary(buf),
      bufferedAmount: (dest) => hub.requesterBufferedAmount(dest),
      newId: () => `hf-${++ids}`,
    });
    guestB = createRoomFileTransfer({
      localAgentId: "peer-b",
      localName: "G1",
      sendJson: (msg) => hub.onPeerControl("peer-b", msg),
      sendBinary: (buf) => hub.onPeerBinary("peer-b", buf),
      newId: () => `bf-${++ids}`,
    });
    guestC = createRoomFileTransfer({
      localAgentId: "peer-c",
      localName: "G2",
      sendJson: (msg) => hub.onPeerControl("peer-c", msg),
      sendBinary: () => {},
      newId: () => `tr-c-${++trC}`,
      createPlaySink: httpC.createPlaySink,
      fetchRoomFile: (url) => httpC.fetchRoomFile(url),
    });
    wireHttp(httpC, guestC);

    hub.addPeer({
      peerId: "peer-b",
      sendJson: (m) => guestB.onControl(m),
      sendBinary: (b) => guestB.onBinary(b),
      bufferedAmount: () => 0,
    });
    hub.addPeer({
      peerId: "peer-c",
      sendJson: (m) => guestC.onControl(m),
      sendBinary: (b) => guestC.onBinary(b),
      bufferedAmount: () => 0,
    });

    const shared = await guestB.shareLocalFile(fileOf("from-g1.txt", 5, 11));
    expect(shared.ok).toBe(true);
    expect(host.getState().entries.some((e) => e.name === "from-g1.txt")).toBe(
      true
    );
    expect(
      guestC.getState().entries.some((e) => e.name === "from-g1.txt")
    ).toBe(true);

    const fileId = shared.ok ? shared.id : "";
    const sink = mockWritable();
    const dl = await guestC.download(fileId, async () => sink.writable);
    if (!dl.ok) expect.fail(`G2 download: ${"error" in dl ? dl.error : "?"}`);
    await vi.waitFor(() => expect(sink.isClosed()).toBe(true));
    expect(sink.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(5);
    expect(sink.chunks[0]?.[0]).toBe(11);
    expect(host.getState().busy).toBe(false);
  });

  it("rejects blocked executable share on any seat", async () => {
    const xfer = createRoomFileTransfer({
      localAgentId: "peer-b",
      localName: "G1",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "x",
    });
    expect((await xfer.shareLocalFile(fileOf("Setup.exe", 10))).ok).toBe(false);
  });
});
