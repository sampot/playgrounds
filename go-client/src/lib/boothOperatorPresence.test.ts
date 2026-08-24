import { describe, expect, it, vi } from "vitest";
import { createOperatorPresence } from "./boothOperatorPresence";

describe("createOperatorPresence", () => {
  it("tracks camera toggle and sends session_camera offer", async () => {
    const send = vi.fn();
    const states: Array<{ camera: boolean; mic: boolean }> = [];
    const presence = createOperatorPresence({
      peerId: "op-test",
      getPc: () => null,
      send,
      onChange: (state) => {
        states.push({ camera: state.camera, mic: state.mic });
      },
      getUserMedia: async () => {
        const track = { kind: "video", stop: vi.fn() } as MediaStreamTrack;
        return {
          getVideoTracks: () => [track],
          getAudioTracks: () => [],
        } as MediaStream;
      },
    });

    const out = await presence.enableCamera();
    expect(out.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: "offer", from: "op-test" })
    );
    expect(states.at(-1)).toEqual({ camera: true, mic: false });

    await presence.disableCamera();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: "unoffer", from: "op-test" })
    );
    expect(states.at(-1)).toEqual({ camera: false, mic: false });
  });

  it("tracks mic toggle and sends session_mic offer", async () => {
    const send = vi.fn();
    const presence = createOperatorPresence({
      peerId: "op-test",
      getPc: () => null,
      send,
      onChange: () => {},
      getUserMedia: async () => {
        const track = { kind: "audio", stop: vi.fn() } as MediaStreamTrack;
        return {
          getVideoTracks: () => [],
          getAudioTracks: () => [track],
        } as MediaStream;
      },
    });

    const out = await presence.enableMic();
    expect(out.ok).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: "offer", from: "op-test" })
    );
    expect(presence.getState().mic).toBe(true);

    await presence.disableMic();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ op: "unoffer", from: "op-test" })
    );
    expect(presence.getState().mic).toBe(false);
  });
});
