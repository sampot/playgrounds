import { describe, expect, it } from "vitest";
import {
  ROOM_FILE_JOB_MAX_TASKS,
  createRoomFileJobRegistry,
  roomFileJobId,
} from "./goRoomFileJobs";

describe("goRoomFileJobs", () => {
  it("uses file id as job id", () => {
    expect(roomFileJobId("clip")).toBe("clip");
    expect(roomFileJobId("  doc  ")).toBe("doc");
  });

  it("defaults to 10 concurrent tasks per file job", () => {
    expect(ROOM_FILE_JOB_MAX_TASKS).toBe(10);
  });

  it("admits tasks until the per-file slot cap, then rejects", () => {
    const reg = createRoomFileJobRegistry();
    const job = reg.open("movie", 50);
    expect(job.id).toBe("movie");
    expect(job.taskCount).toBe(0);
    for (let i = 1; i <= ROOM_FILE_JOB_MAX_TASKS; i++) {
      expect(reg.admitTask(job.id, `tr-${i}`)).toEqual({
        ok: true,
        jobId: "movie",
      });
    }
    expect(reg.get(job.id)?.taskCount).toBe(10);
    const eleventh = reg.admitTask(job.id, "tr-11");
    expect(eleventh.ok).toBe(false);
    if (!eleventh.ok) {
      expect(eleventh.error).toMatch(/同一檔案最多 10/);
    }
  });

  it("releases a slot so a later task can admit", () => {
    const reg = createRoomFileJobRegistry({ maxTasksPerJob: 2 });
    const job = reg.open("burst", 80);
    expect(reg.admitTask(job.id, "a").ok).toBe(true);
    expect(reg.admitTask(job.id, "b").ok).toBe(true);
    expect(reg.admitTask(job.id, "c").ok).toBe(false);
    expect(reg.releaseTask("a")).toBe(job.id);
    expect(reg.admitTask(job.id, "c")).toEqual({ ok: true, jobId: "burst" });
  });

  it("treats re-admit of the same transferId as idempotent", () => {
    const reg = createRoomFileJobRegistry();
    const job = reg.open("img", 50);
    expect(reg.admitTask(job.id, "tr-1").ok).toBe(true);
    expect(reg.admitTask(job.id, "tr-1").ok).toBe(true);
    expect(reg.get(job.id)?.taskCount).toBe(1);
  });

  it("keeps different file jobs independent", () => {
    const reg = createRoomFileJobRegistry({ maxTasksPerJob: 2 });
    const a = reg.open("file-a", 50);
    const b = reg.open("file-b", 80);
    expect(reg.admitTask(a.id, "p1").ok).toBe(true);
    expect(reg.admitTask(a.id, "p2").ok).toBe(true);
    expect(reg.admitTask(a.id, "p3").ok).toBe(false);
    expect(reg.admitTask(b.id, "s1").ok).toBe(true);
    expect(reg.admitTask(b.id, "s2").ok).toBe(true);
    expect(reg.admitTask(b.id, "s3").ok).toBe(false);
  });
});
