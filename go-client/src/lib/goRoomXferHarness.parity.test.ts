import { describe, expect, it, vi } from "vitest";
import {
  SESSION_FILE_TYPE,
  encodeSessionFileChunk,
} from "@pg/roster/rosterSessionFile";
import { createRoomFileTransfer } from "./goRoomFileTransfer";
import {
  ROOM_XFER_PRODUCT_APIS,
  createMemorySaveWritable,
  roomFilePath,
} from "./goRoomXferHarness";
import { roomFilePath as productRoomFilePath } from "./goRoomPlayRegistry";
import {
  ensureRoomFileSw,
  listenRoomOpenTransfer,
  listenRoomPlaySaveCancel,
  listenRoomTransferEnd,
} from "./goRoomPlayBridge";

describe("room-xfer harness product parity", () => {
  it("lists the same transfer／SW APIs as 包廂 download／preview", () => {
    expect(ROOM_XFER_PRODUCT_APIS).toEqual([
      "createRoomFileTransfer",
      "download",
      "play",
      "seekPlay",
      "stopPlay",
      "notePlayhead",
      "acceptHttpTransfer",
      "noteHttpTransferEnd",
      "shareLocalFile",
      "roomFilePath",
      "attachPlaybackUrl",
      "listenRoomOpenTransfer",
      "listenRoomTransferEnd",
      "listenRoomPlaySaveCancel",
      "ensureRoomFileSw",
    ]);
    expect(typeof createRoomFileTransfer).toBe("function");
    expect(typeof listenRoomOpenTransfer).toBe("function");
    expect(typeof listenRoomTransferEnd).toBe("function");
    expect(typeof listenRoomPlaySaveCancel).toBe("function");
    expect(typeof ensureRoomFileSw).toBe("function");
    expect(productRoomFilePath("xf-note")).toBe("/room-file/xf-note");
    expect(roomFilePath).toBe(productRoomFilePath);
  });

  it("download() remote path fetches roomFileDownloadPath via fetchRoomFile (same as UI)", async () => {
    const fetches: string[] = [];
    const json: unknown[] = [];
    let sinkOpened = false;
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => json.push(m),
      sendBinary: () => {},
      createPlaySink: (opts) => {
        sinkOpened = opts.mode === "save";
        return {
          url: productRoomFilePath(opts.playId ?? "x"),
          append: async () => "ok" as const,
          evictUntil: async () => "ok" as const,
          end: () => {},
          destroy: () => {},
          bufferedBytes: () => 0,
        };
      },
      fetchRoomFile: async (url) => {
        fetches.push(url);
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "Content-Length": "4" },
        });
      },
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "note-1",
      name: "note.txt",
      size: 4,
      mime: "text/plain",
      owner: "h",
    });
    const mem = createMemorySaveWritable();
    const out = await guest.download("note-1", async () => mem.writable);
    expect(out.ok).toBe(true);
    expect(sinkOpened).toBe(true);
    expect(fetches).toEqual(["/room-file/note-1?purpose=save"]);
    expect(mem.byteLength()).toBe(4);
    expect(
      json.some((m) => (m as { op?: string }).op === "request")
    ).toBe(false);
    /** SW open-transfer → acceptHttpTransfer would send request; download waits on fetch. */
    void encodeSessionFileChunk;
  });

  it("play() exposes canonical /room-file/ playback.url", async () => {
    const guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: () => {},
      sendBinary: () => {},
      createPlaySink: (opts) => ({
        url: productRoomFilePath(opts.playId ?? "x", {
          purpose: opts.mode === "save" ? "save" : "play",
        }),
        append: async () => "ok" as const,
        evictUntil: async () => "ok" as const,
        end: () => {},
        destroy: () => {},
        bufferedBytes: () => 0,
      }),
    });
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "img-1",
      name: "a.png",
      size: 8,
      mime: "image/png",
      owner: "h",
    });
    expect((await guest.play("img-1")).ok).toBe(true);
    expect(guest.getState().playback?.url).toBe("/room-file/img-1?purpose=play");
  });
});
