import { describe, expect, it, vi } from "vitest";

vi.mock("./goRoomPlayBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./goRoomPlayBridge")>();
  return {
    ...actual,
    ensureRoomFileSw: vi.fn(async () => true),
    onRoomFileSwControllerChange: vi.fn(() => () => {}),
  };
});

import {
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_TYPE,
  decodeSessionFileChunk,
  encodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import { createPlayByteWindow, createRegistryPlaySink, createRoomPlaySink } from "./goRoomFilePlay";
import {
  createRoomPlayRegistry,
  defaultRoomPlaySessions,
  parseRoomFilePath,
  parseRoomFilePurpose,
} from "./goRoomPlayRegistry";
import { GO_ROOM_FILE_SW_REQUIRED, GO_ROOM_HANG_FILES_ONLY } from "./goRoom";
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

/** In-process `/room-file/` façade for unit tests (no real Service Worker). */
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
      endHandler?.({
        fileId,
        transferId,
        ok,
        delivered,
        reason,
      });
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
    sessions,
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
      if (sessions.hasLocal(id)) {
        const meta = sessions.meta(id)!;
        const body = sessions.liveBody(id);
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": meta.mime,
            "Content-Length": String(meta.size),
            "Accept-Ranges": "bytes",
          },
        });
      }
      let meta = sessions.meta(id);
      for (let i = 0; i < 100 && !meta; i++) {
        await new Promise((r) => setTimeout(r, 5));
        meta = sessions.meta(id);
      }
      if (!meta || meta.size <= 0) {
        return new Response(null, { status: 404 });
      }
      const range = { start: 0, end: meta.size - 1 };
      const transferId = `sw-tr-${++trN}`;
      const purpose = parseRoomFilePurpose(new URL(url, "http://go.local").search);
      openHandler?.({
        fileId: id,
        jobId: id,
        transferId,
        offset: 0,
        end: range.end,
        purpose,
      });
      const raw = await sessions.rangeBody(id, range);
      const body = watchBody(id, transferId, raw, meta.size);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": meta.mime,
          "Content-Range": `bytes ${range.start}-${range.end}/${meta.size}`,
          "Content-Length": String(meta.size),
        },
      });
    },
  };
}

function wireHttpOpen(
  http: ReturnType<typeof httpFacade>,
  guest: ReturnType<typeof createRoomFileTransfer>
) {
  http.onOpenTransfer((msg) => {
    guest.acceptHttpTransfer(msg);
  });
  http.onTransferEnd((msg) => {
    guest.noteHttpTransferEnd(msg);
  });
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

  it("lists share without Service Worker; local play needs SW", async () => {
    const xfer = createRoomFileTransfer({
      localAgentId: "host-1",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: () => {},
      ensureRoomFileSw: async () => false,
      newId: () => "file-sw",
    });
    const share = await xfer.shareLocalFile(fileOf("note.txt", 4));
    expect(share.ok).toBe(true);
    expect(xfer.getState().entries).toHaveLength(1);
    const play = await xfer.play("file-sw");
    expect(play).toEqual({ ok: false, error: GO_ROOM_FILE_SW_REQUIRED });
  });

  it("infers video/mp4 when the picker File has an empty type", async () => {
    const xfer = createRoomFileTransfer({
      localAgentId: "host-1",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "file-1",
    });
    expect((await xfer.shareLocalFile(fileOf("clip.mp4", 8, ""))).ok).toBe(true);
    expect(xfer.getState().entries[0]?.mime).toBe("video/mp4");
  });

  it("does not serve hung files from the page registry — HTTP always goes to fetch (SW)", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(new Uint8Array([9, 8, 7, 6]), {
          status: 200,
          headers: { "Content-Length": "4" },
        })
    );
    vi.stubGlobal("fetch", fetch);
    try {
      const xfer = createRoomFileTransfer({
        localAgentId: "h",
        localName: "太郎",
        sendJson: () => {},
        sendBinary: () => {},
        newId: () => "file-1",
      });
      expect((await xfer.shareLocalFile(fileOf("note.txt", 4))).ok).toBe(true);
      expect(defaultRoomPlaySessions.hasLocal("file-1")).toBe(false);
      const sink = mockWritable();
      const saved = await xfer.download("file-1", async () => sink.writable);
      expect(saved.ok).toBe(true);
      expect(fetch).toHaveBeenCalled();
      expect(String(fetch.mock.calls[0]![0])).toMatch(/\/room-file\/file-1/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects remote primeBrowserDownload — remote must use download()+fetch", async () => {
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
      id: "file-1",
      name: "clip.txt",
      size: 3,
      owner: "h",
      ownerName: "太郎",
    });
    const primed = guest.primeBrowserDownload("file-1");
    expect(primed.ok).toBe(false);
    if (!primed.ok) expect(primed.error).toMatch(/HTTP fetch|下載/);
  });

  it("re-enables listing after SW transfer-complete for a remote save", async () => {
    const http = httpFacade();
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
      createPlaySink: http.createPlaySink,
      fetchRoomFile: http.fetchRoomFile,
    });
    wireHttpOpen(http, guest);
    await owner.shareLocalFile(fileOf("clip.bin", 4));
    const sink = mockWritable();
    const pending = guest.download("file-1", async () => sink.writable);
    expect((await pending).ok).toBe(true);
    expect(guest.getState().entries[0]?.status).toBe("listed");
    expect(guest.getState().busy).toBe(false);
  });

  it("clears transferring when SW completes save", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () =>
        createPlayByteWindow({ mime: "application/octet-stream", size: 4 }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.bin",
      size: 4,
      owner: "h",
    });
    expect((await guest.openRemoteHttp("file-1", "save")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-save",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-save",
        seq: 0,
        payload: new Uint8Array([1, 2, 3, 4]),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(4);
    });
    guest.noteHttpTransferEnd({
      fileId: "file-1",
      transferId: "sw-save",
      ok: true,
      delivered: 4,
    });
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("listed");
    });
  });

  it("cancelHttpSave after a completed transfer does not leave status transferring", async () => {
    const http = httpFacade();
    const g2 = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: http.createPlaySink,
      fetchRoomFile: () => new Promise(() => {}),
    });
    g2.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "a.bin",
      size: 2,
      owner: "h",
    });
    void g2.download("file-1", async () => mockWritable().writable);
    await vi.waitFor(() => {
      expect(g2.getState().entries[0]?.status).toBe("transferring");
    });
    expect(
      g2.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-1",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    g2.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-1",
        seq: 0,
        payload: new Uint8Array([9, 9]),
      })
    );
    await vi.waitFor(() => {
      expect(g2.getState().entries[0]?.received).toBe(2);
    });
    g2.noteHttpTransferEnd({
      fileId: "file-1",
      transferId: "sw-1",
      ok: true,
      delivered: 2,
    });
    await vi.waitFor(() => {
      expect(g2.getState().entries[0]?.status).toBe("listed");
    });
    /** Safari often cancel()s the SW stream after a successful body. */
    g2.cancelHttpSave("file-1");
    expect(g2.getState().entries[0]?.status).toBe("listed");
  });

  it("does not flip back to transferring when Edge reopens save GET after SW complete", async () => {
    const http = httpFacade();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: http.createPlaySink,
      /** First fetch never settles — mimics Edge cancel／retry while pipe hangs. */
      fetchRoomFile: () => new Promise(() => {}),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.bin",
      size: 4,
      owner: "h",
    });
    void guest.download("file-1", async () => mockWritable().writable);
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("transferring");
    });
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-1",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-1",
        seq: 0,
        payload: new Uint8Array([1, 2, 3, 4]),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(4);
    });
    guest.noteHttpTransferEnd({
      fileId: "file-1",
      transferId: "sw-1",
      ok: true,
      delivered: 4,
    });
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("listed");
    });
    /**
     * Edge／Chrome often cancel() the finished stream then reopen GET.
     * Must not disable 下載／預覽 again for that probe.
     */
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-retry",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    expect(guest.getState().entries[0]?.status).toBe("listed");
    expect(guest.getState().busy).toBe(false);
  });

  it("cancelHttpSave ends the DC transfer without aborting the HTTP session", async () => {
    const http = httpFacade();
    const json: unknown[] = [];
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((r) => {
      releaseFetch = r;
    });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async (url) => {
        await fetchGate;
        return http.fetchRoomFile(url);
      },
    });
    wireHttpOpen(http, guest);
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.bin",
      size: 8,
      owner: "h",
      ownerName: "太郎",
    });
    const sink = mockWritable();
    const pending = guest.download("file-1", async () => sink.writable);
    await vi.waitFor(() => {
      expect(guest.getState().busy).toBe(true);
      expect(http.sessions.meta("file-1")).not.toBeNull();
    });
    /** SW would open-transfer on GET; fetch is gated — accept explicitly. */
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-1",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    guest.cancelHttpSave("file-1");
    await vi.waitFor(() => {
      expect(guest.getState().busy).toBe(false);
    });
    /** Must end, not abort/delete — a retry fetch would otherwise 404「找不到這個檔」. */
    expect(http.sessions.meta("file-1")).toMatchObject({ ended: true });
    releaseFetch();
    expect((await pending).ok).toBe(false);
    expect(json.some((m) => (m as { op?: string }).op === "cancel")).toBe(true);
  });

  it("cancelDownload mid-save returns cancelled and re-lists without error", async () => {
    const http = httpFacade();
    const json: unknown[] = [];
    let fetchSignal: AbortSignal | undefined;
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((r) => {
      releaseFetch = r;
    });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async (url, init) => {
        fetchSignal = init?.signal;
        await fetchGate;
        if (init?.signal?.aborted) {
          throw new DOMException("The operation was aborted.", "AbortError");
        }
        return http.fetchRoomFile(url);
      },
    });
    wireHttpOpen(http, guest);
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.bin",
      size: 8,
      owner: "h",
    });
    const sink = mockWritable();
    const pending = guest.download("file-1", async () => sink.writable);
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("transferring");
      expect(fetchSignal).toBeTruthy();
    });
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-cancel",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);
    guest.cancelDownload("file-1");
    releaseFetch();
    const out = await pending;
    expect(out).toMatchObject({ ok: false, cancelled: true });
    expect(guest.getState().entries[0]?.status).toBe("listed");
    expect(guest.getState().entries[0]?.error).toBeUndefined();
    expect(guest.getState().busy).toBe(false);
    expect(json.some((m) => (m as { op?: string }).op === "cancel")).toBe(true);
  });

  it("local play／download use /room-file/<id> with zero peer request", async () => {
    const http = httpFacade();
    const json: unknown[] = [];
    const bins: ArrayBuffer[] = [];
    const xfer = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: (b) => bins.push(b),
      newId: () => "file-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: http.fetchRoomFile,
      registerLocalFile: (id, file) => http.sessions.registerLocal(id, file),
      unregisterLocalFile: (id) => http.sessions.unregisterLocal(id),
    });
    expect((await xfer.shareLocalFile(fileOf("note.txt", 4))).ok).toBe(true);
    const played = await xfer.play("file-1");
    expect(played.ok).toBe(true);
    expect(xfer.getState().playback?.url).toBe("/room-file/file-1?purpose=play");
    expect(xfer.getState().playback?.url.startsWith("blob:")).toBe(false);

    const sink = mockWritable();
    const saved = await xfer.download("file-1", async () => sink.writable);
    expect(saved.ok).toBe(true);
    expect(sink.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(4);
    expect(json.some((m) => (m as { op?: string }).op === "request")).toBe(
      false
    );
    expect(bins).toHaveLength(0);

    const primed = xfer.primeBrowserDownload("file-1");
    expect(primed.ok).toBe(true);
    if (primed.ok) {
      expect(primed.url).toBe("/room-file/file-1?purpose=save");
      expect(primed.name).toBe("note.txt");
    }
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

  it("downloads via fetch(/room-file/…) — DC chunks feed the HTTP body, not the writable", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const http = httpFacade();
    const fetched: string[] = [];
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
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async (url) => {
        fetched.push(url);
        return http.fetchRoomFile(url);
      },
    });
    wireHttpOpen(http, guest);

    await owner.shareLocalFile(fileOf("clip.txt", 3));
    const sink = mockWritable();
    const started = await guest.download("file-1", async () => sink.writable);
    expect(started.ok).toBe(true);
    expect(fetched).toEqual(["/room-file/file-1?purpose=save"]);

    await vi.waitFor(() => {
      expect(sink.isClosed()).toBe(true);
    });
    const received = sink.chunks.reduce((n, c) => n + c.byteLength, 0);
    expect(received).toBe(3);
    expect(guest.getState().entries[0]).not.toHaveProperty("blobUrl");
    expect(guest.getState().busy).toBe(false);
  });

  it("fails remote download when the HTTP body length does not match Content-Length", async () => {
    const http = httpFacade();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async () =>
        new Response(new Uint8Array([1, 2]), {
          status: 200,
          headers: { "Content-Length": "5" },
        }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.txt",
      size: 5,
      owner: "h",
      ownerName: "太郎",
    });
    const sink = mockWritable();
    const out = await guest.download("file-1", async () => sink.writable);
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ error: expect.stringMatching(/不完整/) });
    expect(guest.getState().busy).toBe(false);
  });

  it("does not abort the HTTP session when DC finishes before fetch reads (Edge 0-byte race)", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const http = httpFacade();
    const destroyed: string[] = [];
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((r) => {
      releaseFetch = r;
    });
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
      createPlaySink: (opts) => {
        const sink = http.createPlaySink(opts);
        const destroy = sink.destroy.bind(sink);
        sink.destroy = () => {
          destroyed.push(opts.playId ?? "play");
          destroy();
        };
        return sink;
      },
      fetchRoomFile: async (url) => {
        await fetchGate;
        return http.fetchRoomFile(url);
      },
    });
    wireHttpOpen(http, guest);

    await owner.shareLocalFile(fileOf("clip.txt", 5));
    const sink = mockWritable();
    const pending = guest.download("file-1", async () => sink.writable);
    await vi.waitFor(() => {
      expect(http.sessions.meta("file-1")).not.toBeNull();
    });
    /** Fetch gated — simulate SW open-transfer for this GET. */
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-edge",
        offset: 0,
        purpose: "save",
      }).ok
    ).toBe(true);

    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(5);
      expect(http.sessions.meta("file-1")?.received).toBe(5);
    });
    /**
     * DC done must NOT end/abort — fetch has not read yet (Safari／Edge race).
     * Spans stay until download() finishes the HTTP body.
     */
    expect(destroyed).toEqual([]);
    expect(http.sessions.meta("file-1")).toMatchObject({
      ended: false,
      received: 5,
    });
    expect(guest.getState().busy).toBe(true);
    expect(guest.getState().entries[0]?.status).toBe("transferring");

    releaseFetch();
    expect((await pending).ok).toBe(true);
    await vi.waitFor(() => {
      expect(sink.isClosed()).toBe(true);
    });
    expect(sink.chunks.reduce((n, c) => n + c.byteLength, 0)).toBe(5);
  });

  it("fails remote download when the HTTP façade returns an error status", async () => {
    const http = httpFacade();
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async () => new Response(null, { status: 404 }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.txt",
      size: 3,
      owner: "h",
      ownerName: "太郎",
    });
    const sink = mockWritable();
    const out = await guest.download("file-1", async () => sink.writable);
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({ error: expect.stringMatching(/找不到|HTTP|下載/) });
    expect(sink.chunks).toHaveLength(0);
    expect(guest.getState().busy).toBe(false);
    /** 404 before SW open-transfer — page must not invent a request. */
    expect(json.some((m) => (m as { op?: string }).op === "request")).toBe(
      false
    );
  });

  it("ignores HTTP need／seek for a different room-file id", async () => {
    const http = httpFacade();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 32,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "other-file",
        transferId: "sw-1",
        offset: 8,
      }).ok
    ).toBe(false);
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-1",
        offset: 8,
      }).ok
    ).toBe(true);
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

  it("plays a remote video into a same-origin /room-file/ URL without a save picker", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const http = httpFacade();
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
      createPlaySink: http.createPlaySink,
    });

    const clip = fileOf("clip.mp4", 4, "video/mp4");
    await owner.shareLocalFile(clip);
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(guest.getState().playback?.id).toBe("file-1");
    await vi.waitFor(() => {
      expect(guest.getState().playback?.url).toBe("/room-file/file-1?purpose=play");
    });
    expect(guest.getState().playback?.name).toBe("clip.mp4");
    expect(guest.getState().playback?.kind).toBe("video");
  });

  it("plays a remote image via the same /room-file/ HTTP URL, not a blob:", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const http = httpFacade();
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => guest.onControl(m),
      sendBinary: (b) => guest.onBinary(b),
      newId: () => "pic-1",
    });
    guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => owner.onControl(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
    });
    await owner.shareLocalFile(fileOf("shot.png", 6, "image/png"));
    expect((await guest.play("pic-1")).ok).toBe(true);
    expect(guest.getState().playback?.url).toBe("/room-file/pic-1?purpose=play");
    expect(guest.getState().playback?.kind).toBe("image");
    expect(guest.getState().playback?.url.startsWith("blob:")).toBe(false);
  });

  it("exposes the same /room-file/<id> path for remote play and download (purpose query differs)", async () => {
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const http = httpFacade();
    const fetched: string[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => guest.onControl(m),
      sendBinary: (b) => guest.onBinary(b),
      newId: () => "shared-1",
    });
    guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => owner.onControl(m),
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: async (url) => {
        fetched.push(url);
        return http.fetchRoomFile(url);
      },
    });
    wireHttpOpen(http, guest);
    await owner.shareLocalFile(fileOf("clip.mp4", 4, "video/mp4"));
    expect((await guest.play("shared-1")).ok).toBe(true);
    const playUrl = guest.getState().playback?.url;
    expect(playUrl).toBe("/room-file/shared-1?purpose=play");
    guest.stopPlay();
    const sink = mockWritable();
    expect((await guest.download("shared-1", async () => sink.writable)).ok).toBe(
      true
    );
    expect(fetched).toEqual(["/room-file/shared-1?purpose=save"]);
    expect(parseRoomFilePath(playUrl ?? "")).toBe(
      parseRoomFilePath(fetched[0] ?? "")
    );
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
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
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(0);
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    const startRequests = json.filter(
      (m) => (m as { op?: string }).op === "request"
    );
    expect(startRequests).toHaveLength(1);
    expect(startRequests[0]).toMatchObject({ offset: 0, transferId: "sw-tr-1" });
    const transferId = "sw-tr-1";
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
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    expect(json[0]).toMatchObject({ offset: 0, transferId: "sw-tr-1" });
    /** Near seeks are resume-only — no new transferId from the page. */
    expect((await guest.seekPlay(64 * 1024)).ok).toBe(true);
    expect((await guest.seekPlay(2 * 1024 * 1024)).ok).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(1);
    /** Far Range = new HTTP → SW allocates transferId. */
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-2",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      offset: 40 * 1024 * 1024,
      transferId: "sw-tr-2",
    });
    /** Far scrub cancels the old open-ended Range so DC follows the seek. */
    expect(
      json.some(
        (m) =>
          (m as { op?: string; transferId?: string }).op === "cancel" &&
          (m as { transferId?: string }).transferId === "sw-tr-1"
      )
    ).toBe(true);
  });

  it("keeps near concurrent play Ranges; far scrub cancels the old one", async () => {
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-2",
        offset: 512 * 1024,
      }).ok
    ).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "cancel")
    ).toHaveLength(0);
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-3",
        offset: 80 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(
      json.some(
        (m) =>
          (m as { op?: string; transferId?: string }).op === "cancel" &&
          ((m as { transferId?: string }).transferId === "sw-tr-1" ||
            (m as { transferId?: string }).transferId === "sw-tr-2")
      )
    ).toBe(true);
    expect(guest.inboundSnaps().map((s) => s.transferId)).toEqual(["sw-tr-3"]);
  });

  it("rejects an eleventh concurrent play Range when the job has 10 tasks", async () => {
    const json: unknown[] = [];
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
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
    /** Near offsets stay admitted together (within SEEK_SLACK). */
    for (let i = 1; i <= 10; i++) {
      expect(
        guest.acceptHttpTransfer({
          fileId: "big",
          transferId: `sw-tr-${i}`,
          offset: (i - 1) * 64 * 1024,
        }).ok
      ).toBe(true);
    }
    const eleventh = guest.acceptHttpTransfer({
      fileId: "big",
      transferId: "sw-tr-11",
      offset: 10 * 64 * 1024,
    });
    expect(eleventh.ok).toBe(false);
    if (!eleventh.ok) expect(eleventh.error).toMatch(/同一檔案最多 10/);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(10);
  });

  it("openRemoteHttp save admits ten concurrent GETs and rejects an eleventh", async () => {
    const json: unknown[] = [];
    const http = httpFacade();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createPlaySink: http.createPlaySink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "burst",
      name: "burst.bin",
      size: 48 * 1024,
      mime: "application/octet-stream",
      owner: "h",
    });
    expect((await guest.openRemoteHttp("burst", "save")).ok).toBe(true);
    for (let i = 1; i <= 10; i++) {
      expect(
        guest.acceptHttpTransfer({
          fileId: "burst",
          transferId: `sw-tr-${i}`,
          offset: 0,
          purpose: "save",
        }).ok
      ).toBe(true);
    }
    const eleventh = guest.acceptHttpTransfer({
      fileId: "burst",
      transferId: "sw-tr-11",
      offset: 0,
      purpose: "save",
    });
    expect(eleventh.ok).toBe(false);
    if (!eleventh.ok) expect(eleventh.error).toMatch(/同一檔案最多 10/);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests).toHaveLength(10);
    expect(
      json.filter((m) => (m as { op?: string }).op === "pause")
    ).toHaveLength(0);
    for (const req of requests) {
      expect(req).toMatchObject({ jobId: "burst", priority: 80 });
    }
  });

  it("does not pause sibling Ranges when admitting another play task", async () => {
    const json: unknown[] = [];
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-2",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "pause")
    ).toHaveLength(0);
    expect(
      json.filter((m) => (m as { op?: string }).op === "request")
    ).toHaveLength(2);
  });

  it("notifies SW reject-transfer when the client job is full", async () => {
    const rejected: { fileId: string; transferId: string; reason?: string }[] =
      [];
    const sink = createPlayByteWindow({ mime: "video/mp4" });
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () => sink,
      rejectHttpTransfer: (fileId, transferId, reason) => {
        rejected.push({ fileId, transferId, reason });
      },
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
    for (let i = 1; i <= 10; i++) {
      expect(
        guest.acceptHttpTransfer({
          fileId: "big",
          transferId: `sw-tr-${i}`,
          offset: (i - 1) * 64 * 1024,
        }).ok
      ).toBe(true);
    }
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-11",
        offset: 10 * 64 * 1024,
      }).ok
    ).toBe(false);
    expect(rejected).toEqual([
      { fileId: "big", transferId: "sw-tr-11", reason: "job-full" },
    ]);
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    const transferId = "sw-tr-1";
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
    const http = httpFacade();
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      newId: () => "tr-1",
      createPlaySink: http.createPlaySink,
      fetchRoomFile: () => new Promise(() => {}),
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
    void guest.download("a", async () => sink.writable);
    await vi.waitFor(() => {
      expect(guest.getState().busy).toBe(true);
    });
    expect((await guest.download("b", async () => sink.writable)).ok).toBe(
      false
    );
  });

  it("lets the owner download their own hanging file without a peer request", async () => {
    const http = httpFacade();
    const json: unknown[] = [];
    const xfer = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "file-1",
      fetchRoomFile: http.fetchRoomFile,
      registerLocalFile: (id, file) => http.sessions.registerLocal(id, file),
      unregisterLocalFile: (id) => http.sessions.unregisterLocal(id),
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

  it("stops the owner pump at request length (partial Range)", async () => {
    let total = 0;
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: (buf) => {
        const chunk = decodeSessionFileChunk(buf);
        if (chunk) total += chunk.payload.byteLength;
      },
      newId: () => "file-1",
    });
    const clip = new File([new Uint8Array(64 * 1024).fill(7)], "clip.mp4", {
      type: "video/mp4",
    });
    await owner.shareLocalFile(clip);
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-range",
      from: "g",
      offset: 1024,
      length: 4096,
    });
    await vi.waitFor(() => {
      expect(total).toBe(4096);
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(total).toBe(4096);
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
      expect(log.some((e) => e === "done:tr-head")).toBe(true);
      expect(log.some((e) => e === "done:tr-tail")).toBe(true);
    });
  });

  it("shares DC by quantum — no transfer dumps unbounded while another is ready", async () => {
    const { DC_SCHED_QUANTUM_CHUNKS, dcPriorityQuantumWeight } = await import(
      "./goRoomFileDcScheduler"
    );
    const ids: string[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: (buf) => {
        const chunk = decodeSessionFileChunk(buf);
        if (chunk) ids.push(chunk.transferId);
      },
      newId: () => "file-1",
    });
    /** 16 chunks each → several quanta. */
    const size = 16 * 16 * 1024;
    const clip = new File([new Uint8Array(size).fill(7)], "big.bin");
    await owner.shareLocalFile(clip);
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-a",
      from: "g",
      offset: 0,
      length: size / 2,
      priority: 40,
    });
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-b",
      from: "g",
      offset: size / 2,
      length: size / 2,
      priority: 40,
    });
    await vi.waitFor(() => {
      expect(ids.filter((x) => x === "tr-a").length).toBe(8);
      expect(ids.filter((x) => x === "tr-b").length).toBe(8);
    });
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    const cap =
      DC_SCHED_QUANTUM_CHUNKS * dcPriorityQuantumWeight(40);
    expect(maxRun).toBeLessThanOrEqual(cap);
  });

  it("serves higher-priority request before lower when both are queued", async () => {
    const ids: string[] = [];
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: () => {},
      sendBinary: (buf) => {
        const chunk = decodeSessionFileChunk(buf);
        if (chunk) ids.push(chunk.transferId);
      },
      newId: () => "file-1",
    });
    const size = 8 * 16 * 1024;
    const clip = new File([new Uint8Array(size).fill(3)], "big.bin");
    await owner.shareLocalFile(clip);
    /** Enqueue low first — high should still win the first quantum. */
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-low",
      from: "g",
      offset: 0,
      length: size / 2,
      priority: 10,
    });
    owner.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "request",
      id: "file-1",
      transferId: "tr-high",
      from: "g",
      offset: size / 2,
      length: size / 2,
      priority: 90,
    });
    await vi.waitFor(() => {
      expect(ids.length).toBeGreaterThan(0);
    });
    expect(ids[0]).toBe("tr-high");
    await vi.waitFor(() => {
      expect(ids.filter((x) => x === "tr-high").length).toBe(4);
      expect(ids.filter((x) => x === "tr-low").length).toBe(4);
    });
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-tr-2",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(guest.getState().playback?.url).toBe(sink.url);
    const requests = json.filter((m) => (m as { op?: string }).op === "request");
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ offset: 0, transferId: "sw-tr-1" });
    expect(requests[1]).toMatchObject({
      offset: 40 * 1024 * 1024,
      transferId: "sw-tr-2",
    });
    /** Far seek must cancel the old Range so DC is not stuck pumping EOF. */
    expect(
      json.some(
        (m) =>
          (m as { op?: string; transferId?: string }).op === "cancel" &&
          (m as { transferId?: string }).transferId === "sw-tr-1"
      )
    ).toBe(true);
    expect(
      guest.inboundSnaps().every((s) => s.transferId !== "sw-tr-1")
    ).toBe(true);
    expect(guest.inboundSnaps().map((s) => s.transferId)).toEqual(["sw-tr-2"]);
  });

  it("caps an open-ended play Range so Chromium does not request the rest of the file", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-open",
        offset: 10 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(json[0]).toMatchObject({
      op: "request",
      transferId: "sw-open",
      offset: 10 * 1024 * 1024,
      length: 2 * 1024 * 1024,
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    const headId = "sw-tr-1";
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-2",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(guest.getState().entries[0]?.received).toBe(40 * 1024 * 1024);
    const seekId = "sw-tr-2";
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
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
    const playId = parseRoomFilePath(guest.getState().playback?.url ?? "");
    expect(playId).toBeTruthy();
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    /** accept primes pin at 0; keep a single pin so maxBytes=16 is one window. */
    expect(sessions.inPinWindow(playId!, 0, 8)).toBe(true);
    const transferId = "sw-tr-1";
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

  it("relays SW Range end as request length", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-cap",
        offset: 10 * 1024 * 1024,
        end: 10 * 1024 * 1024 + 2 * 1024 * 1024 - 1,
      }).ok
    ).toBe(true);
    expect(json[0]).toMatchObject({
      op: "request",
      transferId: "sw-tr-cap",
      offset: 10 * 1024 * 1024,
      length: 2 * 1024 * 1024,
    });
  });

  it("treats SW transfer-complete for a partial Range as success", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createPlaySink: () =>
        createPlayByteWindow({
          mime: "video/mp4",
          maxBytes: 64,
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "big",
        transferId: "sw-tr-cap",
        offset: 0,
        end: 15,
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-tr-cap",
        seq: 0,
        payload: new Uint8Array(16).fill(1),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(16);
    });
    guest.noteHttpTransferEnd({
      fileId: "big",
      transferId: "sw-tr-cap",
      ok: true,
      delivered: 16,
    });
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("listed");
    });
    expect(guest.getState().entries[0]?.error).toBeUndefined();
    expect(guest.getState().playback).not.toBeNull();
    expect(
      json.some(
        (m) =>
          (m as { op?: string; transferId?: string }).op === "cancel" &&
          (m as { transferId?: string }).transferId === "sw-tr-cap"
      )
    ).toBe(true);
  });

  it("pauses a mid-file play Range when the window is full", async () => {
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
      createPlaySink: () => sink,
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "clip.mp4",
      size: 200,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-mid",
        offset: 40,
        end: 99,
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-tr-mid",
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

  it("does not mark success on owner done until SW transfer-complete", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      newId: () => "id-1",
      createPlaySink: () =>
        createPlayByteWindow({
          mime: "text/plain",
          maxBytes: 64,
        }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "a.txt",
      size: 4,
      owner: "h",
    });
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-tr-1",
        seq: 0,
        payload: new Uint8Array([1, 2, 3, 4]),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(4);
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "done",
      id: "file-1",
      transferId: "sw-tr-1",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(guest.getState().busy).toBe(true);
    expect(guest.getState().entries[0]?.status).toBe("transferring");
    guest.noteHttpTransferEnd({
      fileId: "file-1",
      transferId: "sw-tr-1",
      ok: true,
      delivered: 4,
    });
    await vi.waitFor(() => {
      expect(guest.getState().busy).toBe(false);
    });
    expect(guest.getState().entries[0]?.status).toBe("listed");
  });

  it("SW transfer-abort after short owner done marks incomplete", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () => createPlayByteWindow({ mime: "text/plain" }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "file-1",
      name: "a.txt",
      size: 8,
      owner: "h",
    });
    expect((await guest.play("file-1")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "file-1",
        transferId: "sw-tr-1",
        offset: 0,
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-tr-1",
        seq: 0,
        payload: new Uint8Array([1, 2]),
      })
    );
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.received).toBe(2);
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "done",
      id: "file-1",
      transferId: "sw-tr-1",
    });
    await Promise.resolve();
    expect(guest.getState().entries[0]?.status).toBe("transferring");
    guest.noteHttpTransferEnd({
      fileId: "file-1",
      transferId: "sw-tr-1",
      ok: false,
      reason: "incomplete",
    });
    await vi.waitFor(() => {
      expect(guest.getState().entries[0]?.status).toBe("error");
    });
    expect(guest.getState().entries[0]?.error).toMatch(/不完整|失敗/);
  });

  it("keeps playback when media cancels a play Range (seek abort)", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () => createPlayByteWindow({ mime: "video/mp4" }),
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-mid",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    expect(guest.getState().playback?.id).toBe("clip");
    guest.noteHttpTransferEnd({
      fileId: "clip",
      transferId: "sw-mid",
      ok: false,
      reason: "cancelled",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(guest.getState().playback?.id).toBe("clip");
    expect(guest.getState().entries[0]?.status).not.toBe("error");
  });

  it("keeps playback when offset-0 cancels after a mid-file seek", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () => createPlayByteWindow({ mime: "video/mp4" }),
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-mid",
        offset: 40 * 1024 * 1024,
      }).ok
    ).toBe(true);
    /** Browser often opens offset 0 after／with a seek, then cancels a body. */
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-head",
        offset: 0,
      }).ok
    ).toBe(true);
    guest.noteHttpTransferEnd({
      fileId: "clip",
      transferId: "sw-head",
      ok: false,
      reason: "cancelled",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(guest.getState().playback?.id).toBe("clip");
    expect(guest.getState().entries[0]?.status).not.toBe("error");
  });

  it("re-lists after stopPlay so preview is not stuck disabled", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: () => createPlayByteWindow({ mime: "video/mp4" }),
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
    expect((await guest.play("clip")).ok).toBe(true);
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-1",
        offset: 0,
      }).ok
    ).toBe(true);
    expect(guest.getState().entries[0]?.status).toBe("transferring");
    guest.stopPlay();
    expect(guest.getState().playback).toBeNull();
    expect(guest.getState().entries[0]?.status).toBe("listed");
  });

  it("primes the play pin on accept so the seek offset is in-window immediately", async () => {
    const sessions = createRoomPlayRegistry();
    const playId = "sf-prime";
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: (opts) =>
        createRoomPlaySink({
          ...opts,
          playId,
          sessions,
          maxBytes: 32 * 1024 * 1024,
        }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: playId,
      name: "clip.mp4",
      size: 80 * 1024 * 1024,
      mime: "video/mp4",
      owner: "h",
    });
    expect((await guest.play(playId)).ok).toBe(true);
    const at = 40 * 1024 * 1024;
    expect(
      guest.acceptHttpTransfer({
        fileId: playId,
        transferId: "sw-mid",
        offset: at,
      }).ok
    ).toBe(true);
    expect(sessions.inPinWindow(playId, at, 64)).toBe(true);
  });

  it("does not cancel a prior play Range when a new HTTP Range opens", async () => {
    const json: unknown[] = [];
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createPlaySink: () => createPlayByteWindow({ mime: "video/mp4" }),
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
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-head",
        offset: 0,
      }).ok
    ).toBe(true);
    guest.onBinary(
      encodeSessionFileChunk({
        transferId: "sw-head",
        seq: 0,
        payload: new Uint8Array(64),
      })
    );
    await Promise.resolve();
    expect(
      guest.acceptHttpTransfer({
        fileId: "clip",
        transferId: "sw-mid",
        offset: 32,
      }).ok
    ).toBe(true);
    expect(
      json.filter((m) => (m as { op?: string }).op === "cancel")
    ).toHaveLength(0);
    expect(
      json.filter(
        (m) =>
          (m as { op?: string }).op === "request" &&
          (m as { transferId?: string }).transferId === "sw-mid"
      ).length
    ).toBe(1);
    guest.noteHttpTransferEnd({
      fileId: "clip",
      transferId: "sw-head",
      ok: false,
      reason: "cancelled",
    });
    await Promise.resolve();
    expect(
      json.some(
        (m) =>
          (m as { op?: string }).op === "cancel" &&
          (m as { transferId?: string }).transferId === "sw-head"
      )
    ).toBe(true);
  });
});
