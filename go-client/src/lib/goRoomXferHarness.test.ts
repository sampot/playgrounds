import { describe, expect, it } from "vitest";
import {
  ROOM_XFER_CONCURRENT,
  ROOM_XFER_FILE_COUNT,
  ROOM_XFER_IDS,
  ROOM_XFER_IO_DELAY_MS,
  ROOM_XFER_MOVIE_SEED,
  ROOM_XFER_MOVIE_SIZE,
  ROOM_XFER_RANGE_SLICE,
  ROOM_XFER_SCRUB_SEEKS,
  buildFixtureFiles,
  createSparsePatternFile,
  isConnectionStarvation,
  movieSeekPlan,
  patternByteAt,
  patternBytes,
  randomMovieSeekPlan,
  sha256Hex,
  tinyPngBytes,
  verifyPatternRange,
} from "./goRoomXferHarness";
import { roomFilePath } from "./goRoomPlayRegistry";

describe("goRoomXferHarness fixtures", () => {
  it("builds five fixtures including movie + sched stress file", () => {
    const f = buildFixtureFiles();
    expect(f.burst.size).toBe(48 * 1024);
    expect(f.image.size).toBe(tinyPngBytes().byteLength);
    expect(f.note.name).toBe("note.txt");
    expect(f.movie.size).toBe(ROOM_XFER_MOVIE_SIZE);
    expect(f.movie.size).toBe(500 * 1024 * 1024);
    expect(f.movie.type).toBe("video/mp4");
    expect(f.sched.size).toBe(1024 * 1024);
    expect(f.sched.name).toBe("sched.bin");
    expect(ROOM_XFER_FILE_COUNT).toBe(5);
    expect(ROOM_XFER_CONCURRENT).toBe(10);
    expect(roomFilePath(ROOM_XFER_IDS.movie)).toBe("/room-file/xf-movie");
    expect(roomFilePath(ROOM_XFER_IDS.movie, { purpose: "play" })).toBe(
      "/room-file/xf-movie?purpose=play"
    );
    expect(roomFilePath(ROOM_XFER_IDS.sched)).toBe("/room-file/xf-sched");
  });

  it("sparse movie File materializes pattern only on slice", async () => {
    const f = buildFixtureFiles();
    const start = 200 * 1024 * 1024;
    const end = start + 64;
    const buf = new Uint8Array(await f.movie.slice(start, end).arrayBuffer());
    expect(buf.byteLength).toBe(64);
    expect(verifyPatternRange(buf, start, ROOM_XFER_MOVIE_SEED)).toBe(true);
  });

  it("pattern bytes are deterministic", () => {
    expect([...patternBytes(4, 11)]).toEqual([
      patternByteAt(0, 11),
      patternByteAt(1, 11),
      patternByteAt(2, 11),
      patternByteAt(3, 11),
    ]);
  });

  it("sha256 matches for identical buffers", async () => {
    const a = patternBytes(32, 1);
    const b = patternBytes(32, 1);
    expect(await sha256Hex(a)).toBe(await sha256Hex(b));
  });

  it("verifyPatternRange checks absolute offsets for seeks", () => {
    const full = patternBytes(1024, ROOM_XFER_MOVIE_SEED);
    const start = 100;
    const end = 200;
    const slice = full.subarray(start, end + 1);
    expect(verifyPatternRange(slice, start, ROOM_XFER_MOVIE_SEED)).toBe(true);
    expect(verifyPatternRange(slice, start + 1, ROOM_XFER_MOVIE_SEED)).toBe(
      false
    );
  });

  it("movieSeekPlan jumps forward then back past 2MiB slack", () => {
    const plan = movieSeekPlan();
    expect(plan.map((p) => p.label)).toEqual([
      "head",
      "tail",
      "seek-mid",
      "seek-forward",
      "seek-back",
    ]);
    const mid = plan.find((p) => p.label === "seek-mid")!;
    const forward = plan.find((p) => p.label === "seek-forward")!;
    const back = plan.find((p) => p.label === "seek-back")!;
    const tail = plan.find((p) => p.label === "tail")!;
    expect(forward.start - mid.start).toBeGreaterThan(2 * 1024 * 1024);
    expect(mid.start - back.start).toBeGreaterThan(2 * 1024 * 1024);
    expect(tail.end).toBe(ROOM_XFER_MOVIE_SIZE - 1);
    for (const p of plan) {
      expect(p.end - p.start + 1).toBe(ROOM_XFER_RANGE_SLICE);
      expect(p.end).toBeLessThan(ROOM_XFER_MOVIE_SIZE);
    }
  });

  it("classifies Failed to fetch as connection starvation", () => {
    expect(
      isConnectionStarvation({
        index: 0,
        ok: false,
        status: 0,
        bytes: 0,
        error: "Failed to fetch",
      })
    ).toBe(true);
    expect(
      isConnectionStarvation({
        index: 0,
        ok: false,
        status: 416,
        bytes: 0,
        error: "expected 206, got 416",
      })
    ).toBe(false);
    expect(
      isConnectionStarvation({
        index: 0,
        ok: true,
        status: 206,
        bytes: 1,
      })
    ).toBe(false);
  });

  it("randomMovieSeekPlan is deterministic for a seed and stays in-bounds", () => {
    expect(ROOM_XFER_SCRUB_SEEKS).toBeGreaterThanOrEqual(6);
    const a = randomMovieSeekPlan({ seed: 7, count: 8 });
    const b = randomMovieSeekPlan({ seed: 7, count: 8 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    const starts = new Set(a.map((p) => p.start));
    expect(starts.size).toBeGreaterThan(1);
    for (const p of a) {
      expect(p.label).toMatch(/^scrub-\d+$/);
      expect(p.start).toBeGreaterThanOrEqual(0);
      expect(p.end).toBeLessThan(ROOM_XFER_MOVIE_SIZE);
      expect(p.end - p.start + 1).toBe(ROOM_XFER_RANGE_SLICE);
    }
    const other = randomMovieSeekPlan({ seed: 99, count: 8 });
    expect(other.map((p) => p.start)).not.toEqual(a.map((p) => p.start));
  });

  it("sparse File can delay arrayBuffer to simulate disk I/O", async () => {
    expect(ROOM_XFER_IO_DELAY_MS).toBeGreaterThan(0);
    const file = createSparsePatternFile({
      name: "slow.mp4",
      size: 4096,
      seed: 3,
      type: "video/mp4",
      ioDelayMs: 40,
    });
    const t0 = Date.now();
    const buf = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const elapsed = Date.now() - t0;
    expect(buf.byteLength).toBe(64);
    expect(verifyPatternRange(buf, 0, 3)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(35);
  });
});

describe("runDirectDownloadSchedScenario (skip SW)", () => {
  it("admits max tasks, waits for every inbound full, rejects overflow", async () => {
    const { ROOM_FILE_JOB_MAX_TASKS } = await import("./goRoomFileJobs");
    const { runDirectDownloadSchedScenario } = await import("./goRoomXferHarness");
    const { createRoomFileTransfer } = await import("./goRoomFileTransfer");
    const { createRoomPlayRegistry } = await import("./goRoomPlayRegistry");
    const { createRegistryPlaySink } = await import("./goRoomFilePlay");
    const { SESSION_FILE_TYPE } = await import(
      "@pg/roster/rosterSessionFile"
    );

    const size = 4096;
    const sessions = createRoomPlayRegistry();
    let guest!: ReturnType<typeof createRoomFileTransfer>;
    const owner = createRoomFileTransfer({
      localAgentId: "h",
      localName: "太郎",
      sendJson: (m) => guest.onControl(m),
      sendBinary: (b) => guest.onBinary(b),
      newId: () => "burst",
    });
    guest = createRoomFileTransfer({
      localAgentId: "g",
      localName: "訪客",
      sendJson: (m) => owner.onControl(m),
      sendBinary: () => {},
      createPlaySink: (opts) =>
        createRegistryPlaySink({ ...opts, sessions }),
    });
    const file = new File([new Uint8Array(size).fill(9)], "burst.bin", {
      type: "application/octet-stream",
    });
    expect((await owner.shareLocalFile(file)).ok).toBe(true);
    guest.onControl({
      type: SESSION_FILE_TYPE,
      v: 1,
      op: "share",
      id: "burst",
      name: "burst.bin",
      size,
      mime: "application/octet-stream",
      owner: "h",
    });

    const report = await runDirectDownloadSchedScenario(guest, "burst", {
      count: ROOM_FILE_JOB_MAX_TASKS,
      size,
      waitMs: 15000,
      minElapsedMs: 0,
    });
    expect(report.admitted).toBe(ROOM_FILE_JOB_MAX_TASKS);
    expect(report.overflowRejected).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.completed).toBe(ROOM_FILE_JOB_MAX_TASKS);
    expect(report.bytesPumped).toBe(size * ROOM_FILE_JOB_MAX_TASKS);
  });
});
