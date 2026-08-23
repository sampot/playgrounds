import { describe, expect, it, vi } from "vitest";
import {
  applyBoothCastStateToMedia,
  boothCastProgramClock,
  boothCastSummaryFromProgram,
  parseBoothCastStatePayload,
} from "./boothCastState";

describe("boothCastState", () => {
  it("parses cast.state payloads", () => {
    expect(parseBoothCastStatePayload({ paused: true })).toEqual({
      paused: true,
    });
    expect(parseBoothCastStatePayload({ t: 12.5 })).toEqual({ t: 12.5 });
    expect(parseBoothCastStatePayload({ paused: false, t: 0 })).toEqual({
      paused: false,
      t: 0,
    });
    expect(parseBoothCastStatePayload({})).toBeNull();
    expect(parseBoothCastStatePayload({ t: -1 })).toBeNull();
  });

  it("derives operator transport clock from file cast snapshot", () => {
    expect(
      boothCastProgramClock({
        kind: "file",
        name: "a.mp3",
        paused: false,
        t: 30,
        duration: 120,
      })
    ).toEqual({
      transport: true,
      paused: false,
      time: 30,
      duration: 120,
    });
    expect(boothCastProgramClock({ kind: "live", label: "cam" })).toEqual({
      transport: false,
      paused: true,
      time: 0,
      duration: 0,
    });
  });

  it("builds cast summary with program clock for snapshots", () => {
    expect(
      boothCastSummaryFromProgram({
        programName: "clip.mp4",
        remoteProgramName: null,
        programTransport: true,
        programPaused: true,
        programTime: 9,
        programDuration: 100,
      })
    ).toEqual({
      kind: "file",
      name: "clip.mp4",
      paused: true,
      t: 9,
      duration: 100,
    });
  });

  it("applies transport controls to room media", () => {
    const media = {
      pauseProgram: vi.fn(),
      playProgram: vi.fn(),
      seekProgram: vi.fn(),
    };
    applyBoothCastStateToMedia(media, { paused: true, t: 40 });
    expect(media.pauseProgram).toHaveBeenCalledTimes(1);
    expect(media.seekProgram).toHaveBeenCalledWith(40);
    expect(media.playProgram).not.toHaveBeenCalled();
  });
});
