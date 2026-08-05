import { describe, expect, it, vi } from "vitest";
import {
  rosterCameraScanSupported,
  startRosterCameraQrScan,
} from "./rosterQrCamera";

describe("rosterQrCamera", () => {
  it("rosterCameraScanSupported reflects getUserMedia", () => {
    expect(typeof rosterCameraScanSupported()).toBe("boolean");
  });

  it("stop ends tracks and clears video", async () => {
    const trackStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream;
    const video = {
      srcObject: null as MediaStream | null,
      readyState: 0,
      videoWidth: 0,
      videoHeight: 0,
      muted: false,
      setAttribute: vi.fn(),
      play: vi.fn(async () => {}),
    } as unknown as HTMLVideoElement;

    const stop = await startRosterCameraQrScan({
      video,
      onCode: () => {},
      intervalMs: 10_000,
      getUserMedia: async () => stream,
    });
    expect(video.srcObject).toBe(stream);
    stop();
    expect(trackStop).toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });

  it("rejects when getUserMedia fails", async () => {
    const video = {
      srcObject: null,
      setAttribute: vi.fn(),
      play: vi.fn(),
    } as unknown as HTMLVideoElement;
    await expect(
      startRosterCameraQrScan({
        video,
        onCode: () => {},
        getUserMedia: async () => {
          throw new Error("Permission denied");
        },
      })
    ).rejects.toMatchObject({ code: "camera_denied" });
  });
});
