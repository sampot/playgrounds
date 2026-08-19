import { describe, expect, it } from "vitest";
import {
  SESSION_FILE_PLAY_BUFFER_MAX,
  createPlayByteWindow,
} from "./goRoomFilePlay";

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
