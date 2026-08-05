import { describe, expect, it, vi } from "vitest";
import {
  detectRosterQrFromVideoFrame,
  rosterCameraScanSupported,
  startRosterCameraQrScan,
} from "./rosterQrCamera";

describe("rosterQrCamera", () => {
  it("rosterCameraScanSupported reflects getUserMedia", () => {
    expect(typeof rosterCameraScanSupported()).toBe("boolean");
  });

  it("without BarcodeDetector uses npm qr decodeImage", async () => {
    const decodeImage = vi.fn(() => "wire-from-npm-qr");
    const video = {
      readyState: 4,
      videoWidth: 64,
      videoHeight: 64,
    } as unknown as HTMLVideoElement;

    const getImageData = vi.fn(() => ({
      width: 64,
      height: 64,
      data: new Uint8ClampedArray(64 * 64 * 4),
    }));
    const ctx = {
      drawImage: vi.fn(),
      getImageData,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    };

    const text = await detectRosterQrFromVideoFrame(video, {
      getDetector: () => null,
      decodeImage: decodeImage as never,
      createCanvas: () => canvas as unknown as HTMLCanvasElement,
    });
    expect(text).toBe("wire-from-npm-qr");
    expect(decodeImage).toHaveBeenCalledOnce();
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
