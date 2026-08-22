import { describe, expect, it, vi } from "vitest";
import {
  createProgramAudioAnalyser,
  roomAudioVisualizerGain,
  roomAudioVisualizerLevels,
  roomTvAudioPlayerFace,
} from "./goRoomAudioPlayer";

describe("roomTvAudioPlayerFace", () => {
  it("is off when TV is off or play canvas is up", () => {
    expect(
      roomTvAudioPlayerFace({
        tvOn: false,
        remoteProgramKind: "audio",
      })
    ).toBe(false);
    expect(
      roomTvAudioPlayerFace({
        tvOn: true,
        playActive: true,
        remoteProgramKind: "audio",
      })
    ).toBe(false);
  });

  it("shows for host local audio decode or remote audio offer", () => {
    expect(
      roomTvAudioPlayerFace({
        tvOn: true,
        ownerDecodeKind: "audio",
      })
    ).toBe(true);
    expect(
      roomTvAudioPlayerFace({
        tvOn: true,
        remoteProgramKind: "audio",
      })
    ).toBe(true);
  });

  it("hides for video／live／image (video wire)", () => {
    expect(
      roomTvAudioPlayerFace({
        tvOn: true,
        ownerDecodeKind: "video",
      })
    ).toBe(false);
    expect(
      roomTvAudioPlayerFace({
        tvOn: true,
        remoteProgramKind: "video",
      })
    ).toBe(false);
    expect(roomTvAudioPlayerFace({ tvOn: true })).toBe(false);
  });
});

describe("roomAudioVisualizerLevels", () => {
  it("returns zeros for empty／invalid input", () => {
    expect(roomAudioVisualizerLevels([], 8)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(roomAudioVisualizerLevels(new Uint8Array(16), 0)).toEqual([]);
    expect(roomAudioVisualizerLevels(new Uint8Array(16), -1)).toEqual([]);
  });

  it("maps frequency bins to 0..1 bar heights (1:1)", () => {
    const freq = new Uint8Array([0, 128, 255, 64]);
    const levels = roomAudioVisualizerLevels(freq, 4);
    expect(levels).toHaveLength(4);
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBeCloseTo(128 / 255, 5);
    expect(levels[2]).toBe(1);
    expect(levels[3]).toBeCloseTo(64 / 255, 5);
  });

  it("averages bins when fewer bars than samples", () => {
    const freq = new Uint8Array([0, 255, 0, 255]);
    const levels = roomAudioVisualizerLevels(freq, 2);
    expect(levels).toHaveLength(2);
    expect(levels[0]).toBeCloseTo(0.5, 5);
    expect(levels[1]).toBeCloseTo(0.5, 5);
  });

  it("scales by audible gain (muted → flat)", () => {
    const freq = new Uint8Array([255, 255, 255, 255]);
    expect(roomAudioVisualizerLevels(freq, 2, { gain: 0 })).toEqual([0, 0]);
    expect(roomAudioVisualizerLevels(freq, 2, { gain: 0.5 })[0]).toBeCloseTo(
      0.5,
      5
    );
  });
});

describe("roomAudioVisualizerGain", () => {
  it("is zero when muted or volume ≤ 0", () => {
    expect(roomAudioVisualizerGain({ volume: 1, muted: true })).toBe(0);
    expect(roomAudioVisualizerGain({ volume: 0, muted: false })).toBe(0);
    expect(roomAudioVisualizerGain({ volume: 0.4, muted: false })).toBe(0.4);
  });
});

describe("createProgramAudioAnalyser", () => {
  function fakeTrack(id = "a") {
    return {
      kind: "audio" as const,
      id,
      readyState: "live" as const,
      enabled: true,
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
  }

  it("returns null when stream has no audio tracks", () => {
    const stream = {
      getAudioTracks: () => [] as MediaStreamTrack[],
    } as unknown as MediaStream;
    expect(createProgramAudioAnalyser({ stream })).toBeNull();
    expect(createProgramAudioAnalyser({ stream: null })).toBeNull();
  });

  it("reads analyser frequency data into levels", () => {
    const freq = new Uint8Array([0, 255, 128, 64]);
    const analyser = {
      fftSize: 32,
      frequencyBinCount: 4,
      connect: vi.fn(),
      getByteFrequencyData(out: Uint8Array) {
        out.set(freq);
      },
    };
    const gainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };
    const source = { connect: vi.fn() };
    const destination = { id: "dest" };
    const ctx = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      createGain: vi.fn(() => gainNode),
      destination,
      resume: vi.fn(async () => {}),
      close: vi.fn(),
      state: "running",
    };
    const stream = {
      getAudioTracks: () => [fakeTrack()],
    } as unknown as MediaStream;
    const handle = createProgramAudioAnalyser({
      stream,
      createContext: () => ctx as never,
    });
    expect(handle).not.toBeNull();
    expect(ctx.createMediaStreamSource).toHaveBeenCalled();
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.connect).toHaveBeenCalledWith(destination);
    const levels = handle!.levels(4, { gain: 1 });
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBe(1);
    expect(levels[2]).toBeCloseTo(128 / 255, 5);
    handle!.close();
    expect(ctx.close).toHaveBeenCalled();
    expect(handle!.levels(4)).toEqual([0, 0, 0, 0]);
  });

  it("routes audible gain through GainNode (not the video element)", () => {
    const analyser = {
      fftSize: 32,
      frequencyBinCount: 4,
      connect: vi.fn(),
      getByteFrequencyData() {},
    };
    const gainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };
    const source = { connect: vi.fn() };
    const ctx = {
      createMediaStreamSource: vi.fn(() => source),
      createAnalyser: vi.fn(() => analyser),
      createGain: vi.fn(() => gainNode),
      destination: {},
      resume: vi.fn(async () => {}),
      close: vi.fn(),
      state: "suspended",
    };
    const handle = createProgramAudioAnalyser({
      stream: {
        getAudioTracks: () => [fakeTrack()],
      } as unknown as MediaStream,
      createContext: () => ctx as never,
    });
    handle!.setGain({ volume: 0.6, muted: false });
    expect(gainNode.gain.value).toBe(0.6);
    expect(ctx.resume).toHaveBeenCalled();
    handle!.setGain({ volume: 1, muted: true });
    expect(gainNode.gain.value).toBe(0);
    handle!.close();
  });
});
