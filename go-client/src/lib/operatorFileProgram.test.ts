import { describe, expect, it, vi } from "vitest";
import {
  applyProgramTransport,
  castFileId,
  castFileScope,
  mediaStreamFromProgram,
  OperatorFileProgram,
} from "./operatorFileProgram";
import type { CapturedProgram } from "./goRoomMedia";

describe("castFileId", () => {
  it("reads file id from cast snapshot", () => {
    expect(castFileId({ kind: "file", id: "shr_abc" })).toBe("shr_abc");
    expect(castFileId({ kind: "live", peerId: "p1" })).toBeNull();
  });
});

describe("castFileScope", () => {
  it("defaults to share", () => {
    expect(castFileScope({ kind: "file", id: "x" })).toBe("share");
    expect(castFileScope({ kind: "file", id: "x", scope: "private" })).toBe(
      "private"
    );
  });
});

describe("applyProgramTransport", () => {
  it("applies pause and seek from cast state", () => {
    const pause = vi.fn();
    const seek = vi.fn();
    const program = { pause, seek } as unknown as CapturedProgram;
    applyProgramTransport(program, {
      kind: "file",
      id: "shr_1",
      paused: true,
      t: 12,
    });
    expect(pause).toHaveBeenCalled();
    expect(seek).toHaveBeenCalledWith(12);
  });
});

describe("OperatorFileProgram", () => {
  it("fetches and captures when cast offers a new file", async () => {
    const onStream = vi.fn();
    const fetchFile = vi.fn(async () => new File([new Uint8Array([1])], "a.mp4"));
    const capture = vi.fn(async () => ({
      audio: null,
      video: { id: "v1" } as MediaStreamTrack,
      stop: vi.fn(),
      play: vi.fn(),
    }));
    const runner = new OperatorFileProgram({ fetchFile, capture, onStream });

    await runner.syncCast({ kind: "file", id: "shr_new" });

    expect(fetchFile).toHaveBeenCalledWith("shr_new", "share");
    expect(capture).toHaveBeenCalled();
    expect(onStream).toHaveBeenCalled();
  });

  it("stops when cast goes idle", async () => {
    const onStream = vi.fn();
    const stop = vi.fn();
    const runner = new OperatorFileProgram({
      fetchFile: vi.fn(async () => new File([new Uint8Array([1])], "a.mp4")),
      capture: vi.fn(async () => ({
        audio: null,
        video: { id: "v1" } as MediaStreamTrack,
        stop,
      })),
      onStream,
    });
    await runner.syncCast({ kind: "file", id: "shr_x" });
    onStream.mockClear();
    await runner.syncCast({ kind: "idle" });
    expect(stop).toHaveBeenCalled();
    expect(onStream).toHaveBeenCalledWith(null);
  });
});

describe("mediaStreamFromProgram", () => {
  it("returns null without tracks", () => {
    expect(
      mediaStreamFromProgram({ audio: null, video: null, stop: () => {} })
    ).toBeNull();
  });
});
