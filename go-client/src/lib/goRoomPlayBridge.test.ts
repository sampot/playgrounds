import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ROOM_PLAY_MSG } from "./goRoomPlayRegistry";
import { listenRoomOpenTransfer } from "./goRoomPlayBridge";

describe("listenRoomOpenTransfer", () => {
  const listeners = new Set<(ev: MessageEvent) => void>();

  beforeEach(() => {
    listeners.clear();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: (_t: string, fn: (ev: MessageEvent) => void) => {
          listeners.add(fn);
        },
        removeEventListener: (_t: string, fn: (ev: MessageEvent) => void) => {
          listeners.delete(fn);
        },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals?.();
  });

  function emit(data: unknown) {
    const ev = { data } as MessageEvent;
    for (const fn of listeners) fn(ev);
  }

  it("forwards SW open-transfer with SW-allocated transferId", () => {
    const seen: unknown[] = [];
    const stop = listenRoomOpenTransfer((msg) => seen.push(msg));
    emit({
      type: ROOM_PLAY_MSG,
      op: "open-transfer",
      id: "file-1",
      jobId: "file-1",
      transferId: "sw-tr-9",
      offset: 0,
      end: 99,
      purpose: "save",
    });
    expect(seen).toEqual([
      {
        fileId: "file-1",
        jobId: "file-1",
        transferId: "sw-tr-9",
        offset: 0,
        end: 99,
        purpose: "save",
      },
    ]);
    stop();
  });

  it("ignores need without open-transfer", () => {
    const seen: unknown[] = [];
    const stop = listenRoomOpenTransfer((msg) => seen.push(msg));
    emit({
      type: ROOM_PLAY_MSG,
      op: "need",
      id: "file-1",
      start: 0,
      end: 10,
    });
    expect(seen).toHaveLength(0);
    stop();
  });
});

describe("listenRoomTransferEnd", () => {
  const listeners = new Set<(ev: MessageEvent) => void>();

  beforeEach(() => {
    listeners.clear();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: (_t: string, fn: (ev: MessageEvent) => void) => {
          listeners.add(fn);
        },
        removeEventListener: (_t: string, fn: (ev: MessageEvent) => void) => {
          listeners.delete(fn);
        },
      },
    });
  });

  function emit(data: unknown) {
    const ev = { data } as MessageEvent;
    for (const fn of listeners) fn(ev);
  }

  it("forwards SW transfer-complete as ok", async () => {
    const { listenRoomTransferEnd } = await import("./goRoomPlayBridge");
    const seen: unknown[] = [];
    const stop = listenRoomTransferEnd((msg) => seen.push(msg));
    emit({
      type: ROOM_PLAY_MSG,
      op: "transfer-complete",
      id: "file-1",
      transferId: "rt-9",
      delivered: 12,
    });
    expect(seen).toEqual([
      {
        fileId: "file-1",
        transferId: "rt-9",
        ok: true,
        delivered: 12,
      },
    ]);
    stop();
  });

  it("forwards SW transfer-abort as not ok", async () => {
    const { listenRoomTransferEnd } = await import("./goRoomPlayBridge");
    const seen: unknown[] = [];
    const stop = listenRoomTransferEnd((msg) => seen.push(msg));
    emit({
      type: ROOM_PLAY_MSG,
      op: "transfer-abort",
      id: "file-1",
      transferId: "rt-9",
      reason: "incomplete",
    });
    expect(seen).toEqual([
      {
        fileId: "file-1",
        transferId: "rt-9",
        ok: false,
        reason: "incomplete",
      },
    ]);
    stop();
  });
});

describe("ensureLocalRoomFileRegistered", () => {
  const posted: unknown[] = [];

  beforeEach(() => {
    posted.length = 0;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: {
          postMessage: (msg: unknown) => posted.push(msg),
        },
        register: vi.fn(async () => ({})),
        ready: Promise.resolve({}),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it("waits for SW then posts register-local", async () => {
    const { ensureLocalRoomFileRegistered } = await import("./goRoomPlayBridge");
    const file = new File([new Uint8Array([1])], "clip.mp4", {
      type: "video/mp4",
    });
    await expect(ensureLocalRoomFileRegistered("sf-abc", file)).resolves.toBe(
      true
    );
    expect(posted).toEqual([
      {
        type: ROOM_PLAY_MSG,
        op: "register-local",
        id: "sf-abc",
        file,
      },
    ]);
  });
});
