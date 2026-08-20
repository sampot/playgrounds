import { describe, expect, it } from "vitest";
import {
  SESSION_FILE_PLAY_BUFFER_MAX,
  createPlayByteWindow,
  createRoomPlaySink,
  savePageTrimPin,
} from "./goRoomFilePlay";
import { createRoomPlayRegistry } from "./goRoomPlayRegistry";

describe("savePageTrimPin", () => {
  it("never advances past writable consumption even if SW pin raced ahead", () => {
    expect(savePageTrimPin(10, 100)).toBe(10);
    expect(savePageTrimPin(50, 40)).toBe(40);
    expect(savePageTrimPin(0, null)).toBe(0);
  });
});

describe("createPlayByteWindow", () => {
  it("drops old bytes so the buffer stays under the cap", async () => {
    const sink = createPlayByteWindow({
      maxBytes: 32,
      highBytes: 24,
      lowBytes: 8,
      mime: "video/mp4",
    });
    expect(sink.url).toMatch(/^blob:/);
    let last: string = "ok";
    for (let i = 0; i < 8; i++) {
      last = await sink.append(new Uint8Array(16).fill(i));
    }
    expect(sink.bufferedBytes()).toBeLessThanOrEqual(32);
    expect(last).toBe("high");
    sink.destroy();
    expect(sink.bufferedBytes()).toBe(0);
  });

  it("keeps the production window well under a whole-file 256 MiB cap", () => {
    expect(SESSION_FILE_PLAY_BUFFER_MAX).toBe(32 * 1024 * 1024);
  });
});

describe("createRoomPlaySink", () => {
  it("exposes a same-origin play URL whose body is the received bytes", async () => {
    const sessions = createRoomPlayRegistry();
    const sink = createRoomPlaySink({
      playId: "tr-1",
      mime: "video/mp4",
      size: 4,
      sessions,
    });
    expect(sink.url).toBe("/room-file/tr-1");
    await sink.append(new Uint8Array([9, 8, 7, 6]));
    sink.end();
    const stream = sessions.liveBody("tr-1");
    const reader = stream.getReader();
    const first = await reader.read();
    expect(Array.from(first.value ?? [])).toEqual([9, 8, 7, 6]);
  });

  it("waits for the pin window so a sequential save never skips bytes past the RAM cap", async () => {
    const sessions = createRoomPlayRegistry();
    const sink = createRoomPlaySink({
      playId: "save-1",
      mime: "application/octet-stream",
      size: 48,
      sessions,
      maxBytes: 16,
      highBytes: 12,
      lowBytes: 4,
      mode: "save",
    });
    const body = sessions.liveBody("save-1");
    const reader = body.getReader();
    const out: number[] = [];

    const producer = (async () => {
      for (let at = 0; at < 48; at += 8) {
        await sink.append(new Uint8Array(8).fill(at / 8), at);
      }
      sink.end();
    })();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) out.push(...value);
    }
    await producer;
    expect(out).toEqual(
      Array.from({ length: 48 }, (_, i) => Math.floor(i / 8))
    );
  });

  it("uses the same-origin play URL for a file larger than the RAM window", () => {
    const sessions = createRoomPlayRegistry();
    const sink = createRoomPlaySink({
      playId: "big",
      mime: "video/mp4",
      size: 400 * 1024 * 1024,
      sessions,
    });
    expect(sink.url).toBe("/room-file/big");
  });

  it("does not construct MediaSource when a playId is set", () => {
    const g = globalThis as { MediaSource?: unknown };
    const prev = g.MediaSource;
    let constructed = 0;
    g.MediaSource = class {
      constructor() {
        constructed += 1;
      }
      addEventListener() {}
      static isTypeSupported() {
        return true;
      }
    };
    try {
      const sink = createRoomPlaySink({
        playId: "big",
        mime: "video/mp4",
        size: 400 * 1024 * 1024,
      });
      expect(sink.url).toBe("/room-file/big");
      expect(constructed).toBe(0);
    } finally {
      g.MediaSource = prev;
    }
  });

  it("does not construct MediaSource when falling back to the byte window", () => {
    const g = globalThis as { MediaSource?: unknown };
    const prev = g.MediaSource;
    let constructed = 0;
    g.MediaSource = class {
      constructor() {
        constructed += 1;
      }
      addEventListener() {}
      static isTypeSupported() {
        return true;
      }
    };
    try {
      const sink = createRoomPlaySink({ mime: "video/mp4" });
      expect(sink.url).toMatch(/^blob:/);
      expect(constructed).toBe(0);
    } finally {
      g.MediaSource = prev;
    }
  });
});
