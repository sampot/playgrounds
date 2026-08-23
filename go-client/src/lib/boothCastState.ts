import type { BoothStateSnapshot } from "@pg/roster/boothChannel";

export type BoothCastStatePayload = {
  paused?: boolean;
  t?: number;
};

export type BoothCastProgramClock = {
  transport: boolean;
  paused: boolean;
  time: number;
  duration: number;
};

export function parseBoothCastStatePayload(
  payload: unknown
): BoothCastStatePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const out: BoothCastStatePayload = {};
  if (o.paused !== undefined) {
    if (typeof o.paused !== "boolean") return null;
    out.paused = o.paused;
  }
  if (o.t !== undefined) {
    if (typeof o.t !== "number" || !Number.isFinite(o.t) || o.t < 0) return null;
    out.t = o.t;
  }
  if (out.paused === undefined && out.t === undefined) return null;
  return out;
}

export function boothCastProgramClock(
  cast: BoothStateSnapshot["cast"] | undefined
): BoothCastProgramClock {
  if (!cast || cast.kind !== "file") {
    return { transport: false, paused: true, time: 0, duration: 0 };
  }
  const paused = cast.paused !== false;
  const time = typeof cast.t === "number" && Number.isFinite(cast.t) ? cast.t : 0;
  const duration =
    typeof cast.duration === "number" && Number.isFinite(cast.duration)
      ? cast.duration
      : 0;
  return {
    transport: true,
    paused,
    time,
    duration,
  };
}

export function boothCastSummaryFromProgram(opts: {
  programName: string | null;
  remoteProgramName: string | null;
  programTransport: boolean;
  programPaused: boolean;
  programTime: number;
  programDuration: number;
}): BoothStateSnapshot["cast"] | undefined {
  const name =
    opts.programName?.trim() || opts.remoteProgramName?.trim() || "";
  if (!name) return { kind: "idle" };
  if (!opts.programTransport) {
    return { kind: "file", name };
  }
  return {
    kind: "file",
    name,
    paused: opts.programPaused,
    t: opts.programTime,
    duration: opts.programDuration,
  };
}

export type BoothCastStateMedia = {
  pauseProgram(): void;
  playProgram(): void;
  seekProgram(seconds: number): void;
};

export function applyBoothCastStateToMedia(
  media: BoothCastStateMedia,
  payload: BoothCastStatePayload
): void {
  if (payload.paused === true) media.pauseProgram();
  else if (payload.paused === false) media.playProgram();
  if (payload.t !== undefined) media.seekProgram(payload.t);
}
