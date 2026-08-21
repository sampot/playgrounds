import { describe, expect, it, vi } from "vitest";
import {
  DC_PRIORITY,
  DC_SCHED_QUANTUM_CHUNKS,
  createDcPumpScheduler,
  dcPriorityQuantumWeight,
  pickNextDcJob,
  pickNextDcTask,
  priorityForPurpose,
} from "./goRoomFileDcScheduler";
import { ROOM_FILE_JOB_MAX_TASKS } from "./goRoomFileJobs";

describe("goRoomFileDcScheduler", () => {
  it("maps purpose to priority (save > play > default)", () => {
    expect(priorityForPurpose("save")).toBe(DC_PRIORITY.SAVE);
    expect(priorityForPurpose("play")).toBe(DC_PRIORITY.PLAY);
    expect(priorityForPurpose(undefined)).toBe(DC_PRIORITY.DEFAULT);
    expect(DC_PRIORITY.SAVE).toBeGreaterThan(DC_PRIORITY.PLAY);
    expect(DC_PRIORITY.PLAY).toBeGreaterThan(DC_PRIORITY.DEFAULT);
  });

  it("weights higher priority with more consecutive quanta", () => {
    expect(dcPriorityQuantumWeight(DC_PRIORITY.SAVE)).toBeGreaterThan(
      dcPriorityQuantumWeight(DC_PRIORITY.DEFAULT)
    );
    expect(dcPriorityQuantumWeight(10)).toBe(1);
  });

  it("picks the highest-priority ready job", () => {
    const jobs = [
      { id: "low", priority: 10, paused: false, abort: false },
      { id: "high", priority: 90, paused: false, abort: false },
      { id: "mid", priority: 50, paused: false, abort: false },
    ];
    expect(pickNextDcJob(jobs, null, 0)?.id).toBe("high");
  });

  it("skips paused and aborted jobs", () => {
    const jobs = [
      { id: "a", priority: 100, paused: true, abort: false },
      { id: "b", priority: 90, paused: false, abort: true },
      { id: "c", priority: 80, paused: false, abort: false },
    ];
    expect(pickNextDcJob(jobs, null, 0)?.id).toBe("c");
    jobs[2]!.paused = true;
    expect(pickNextDcJob(jobs, null, 0)).toBeNull();
  });

  it("round-robins equal priority after streak is exhausted", () => {
    const jobs = [
      { id: "a", priority: 40, paused: false, abort: false },
      { id: "b", priority: 40, paused: false, abort: false },
      { id: "c", priority: 40, paused: false, abort: false },
    ];
    /** weight(40)=1 → after one quantum must yield. */
    expect(pickNextDcJob(jobs, null, 0)?.id).toBe("a");
    expect(pickNextDcJob(jobs, "a", 1)?.id).toBe("b");
    expect(pickNextDcJob(jobs, "b", 1)?.id).toBe("c");
    expect(pickNextDcJob(jobs, "c", 1)?.id).toBe("a");
  });

  it("keeps a high-priority job for its weight streak then yields", () => {
    const jobs = [
      { id: "hi", priority: 80, paused: false, abort: false },
      { id: "lo", priority: 40, paused: false, abort: false },
    ];
    expect(pickNextDcJob(jobs, null, 0)?.id).toBe("hi");
    expect(pickNextDcJob(jobs, "hi", 1)?.id).toBe("hi");
    /** weight(80)=2 → streak 2 forces yield to lo. */
    expect(pickNextDcJob(jobs, "hi", 2)?.id).toBe("lo");
  });

  it("exports a positive quantum (bytes stay bounded per turn)", () => {
    expect(DC_SCHED_QUANTUM_CHUNKS).toBeGreaterThan(0);
    expect(DC_SCHED_QUANTUM_CHUNKS).toBeLessThanOrEqual(16);
  });

  it("runs jobs in quantum turns and prefers higher priority", async () => {
    const order: string[] = [];
    const remaining = new Map([
      ["hi", 6],
      ["lo", 6],
    ]);
    const sched = createDcPumpScheduler({
      quantumChunks: 2,
      waitDrain: async () => {},
    });
    const enqueue = (id: string, priority: number) => {
      sched.enqueue({
        id,
        priority,
        sendOne: async () => {
          order.push(id);
          const left = (remaining.get(id) ?? 1) - 1;
          remaining.set(id, left);
          return left <= 0 ? "done" : "more";
        },
        onComplete: () => {},
        onError: () => {},
      });
    };
    enqueue("lo", 40);
    enqueue("hi", 80);
    await vi.waitFor(() => {
      expect(sched.size()).toBe(0);
    });
    expect(order.slice(0, 2)).toEqual(["hi", "hi"]);
    /** hi weight=2 → at most 2 quanta = 4 chunks before yielding. */
    let run = 1;
    let maxRun = 1;
    for (let i = 1; i < order.length; i++) {
      if (order[i] === order[i - 1]) {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else run = 1;
    }
    expect(maxRun).toBeLessThanOrEqual(2 * dcPriorityQuantumWeight(80));
    expect(order.filter((x) => x === "hi")).toHaveLength(6);
    expect(order.filter((x) => x === "lo")).toHaveLength(6);
    /** lo must appear before hi is fully drained (anti-starvation). */
    const lastHi = order.lastIndexOf("hi");
    const firstLo = order.indexOf("lo");
    expect(firstLo).toBeGreaterThanOrEqual(0);
    expect(firstLo).toBeLessThan(lastHi);
  });

  it("pickNextDcTask chooses job then yields across jobs by streak", () => {
    const tasks = [
      { id: "t1", jobId: "file-a", priority: 50, paused: false, abort: false },
      { id: "t2", jobId: "file-a", priority: 50, paused: false, abort: false },
      { id: "t3", jobId: "file-b", priority: 80, paused: false, abort: false },
    ];
    expect(pickNextDcTask(tasks, null, null, 0)?.id).toBe("t3");
    expect(pickNextDcTask(tasks, "t3", "file-b", 1)?.id).toBe("t3");
    /** weight(80)=2 → yield to other file job. */
    expect(pickNextDcTask(tasks, "t3", "file-b", 2)?.jobId).toBe("file-a");
  });

  it("schedules ROOM_FILE_JOB_MAX_TASKS concurrent download tasks under one job", async () => {
    expect(ROOM_FILE_JOB_MAX_TASKS).toBe(10);
    const completed = new Set<string>();
    const order: string[] = [];
    const sched = createDcPumpScheduler({
      quantumChunks: 2,
      waitDrain: async () => {},
    });
    for (let i = 0; i < ROOM_FILE_JOB_MAX_TASKS; i++) {
      const id = `dl-${i}`;
      let left = 3;
      sched.enqueue({
        id,
        jobId: "burst",
        priority: DC_PRIORITY.SAVE,
        sendOne: async () => {
          order.push(id);
          left -= 1;
          return left <= 0 ? "done" : "more";
        },
        onComplete: () => {
          completed.add(id);
        },
        onError: () => {},
      });
    }
    await vi.waitFor(() => {
      expect(completed.size).toBe(ROOM_FILE_JOB_MAX_TASKS);
    });
    expect(sched.size()).toBe(0);
    /** No single task monopolizes the whole run. */
    expect(new Set(order.slice(0, 10)).size).toBeGreaterThan(1);
  });
});
