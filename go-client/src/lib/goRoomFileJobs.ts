/**
 * Room file **job** = one file id (`/room-file/<id>`).
 * `<img>`／`<video>`／download all share that job; SW uses the same id.
 *
 * Task = one HTTP roundtrip／`transferId` under that file. Concurrent cap per
 * job；which tasks open is the HTTP client’s choice — not the DC scheduler.
 *
 * Page may still keep a one-active-job policy (`busy`) — that is separate and
 * may change (e.g. multi-download). Play vs download is page UI, not job id.
 */

export const ROOM_FILE_JOB_MAX_TASKS = 10;

/** Prefix of admit-reject errors (tests／UI may match). */
export const ROOM_FILE_JOB_SLOT_FULL = "同一檔案最多";

export type RoomFileJobId = string;

/** Job id ≡ file id (SW／page). */
export function roomFileJobId(fileId: string): RoomFileJobId {
  return fileId.trim();
}

export type RoomFileJobSnap = {
  id: RoomFileJobId;
  fileId: string;
  /** Hint for DC job-level pick (page UI; not SW play／save). */
  priority: number;
  taskIds: string[];
  taskCount: number;
};

export type AdmitTaskResult =
  | { ok: true; jobId: RoomFileJobId }
  | { ok: false; error: string; jobId?: RoomFileJobId };

/**
 * Per-file admission registry. Byte scheduling of admitted tasks is
 * `goRoomFileDcScheduler`.
 */
export function createRoomFileJobRegistry(opts?: {
  maxTasksPerJob?: number;
}) {
  const maxTasks = Math.max(1, opts?.maxTasksPerJob ?? ROOM_FILE_JOB_MAX_TASKS);
  type Job = {
    id: RoomFileJobId;
    fileId: string;
    priority: number;
    tasks: Set<string>;
  };
  const jobs = new Map<RoomFileJobId, Job>();
  const taskToJob = new Map<string, RoomFileJobId>();

  function snap(job: Job): RoomFileJobSnap {
    return {
      id: job.id,
      fileId: job.fileId,
      priority: job.priority,
      taskIds: [...job.tasks],
      taskCount: job.tasks.size,
    };
  }

  return {
    maxTasksPerJob: maxTasks,

    open(fileId: string, priority: number): RoomFileJobSnap {
      const id = roomFileJobId(fileId);
      if (!id) {
        throw new Error("missing file id for job");
      }
      const existing = jobs.get(id);
      if (existing) {
        existing.priority = priority;
        return snap(existing);
      }
      const job: Job = {
        id,
        fileId: id,
        priority,
        tasks: new Set(),
      };
      jobs.set(id, job);
      return snap(job);
    },

    get(id: RoomFileJobId): RoomFileJobSnap | null {
      const j = jobs.get(roomFileJobId(id));
      return j ? snap(j) : null;
    },

    setPriority(id: RoomFileJobId, priority: number): void {
      const j = jobs.get(roomFileJobId(id));
      if (j) j.priority = priority;
    },

    admitTask(jobId: RoomFileJobId, transferId: string): AdmitTaskResult {
      const jid = roomFileJobId(jobId);
      const tid = transferId.trim();
      if (!tid) return { ok: false, error: "缺少 transferId" };
      const job = jobs.get(jid);
      if (!job) return { ok: false, error: "沒有進行中的工作" };
      if (job.tasks.has(tid)) return { ok: true, jobId: jid };
      if (taskToJob.has(tid)) {
        return { ok: false, error: "transfer 已屬其他工作", jobId: jid };
      }
      if (job.tasks.size >= maxTasks) {
        return {
          ok: false,
          error: `${ROOM_FILE_JOB_SLOT_FULL} ${maxTasks} 路傳輸`,
          jobId: jid,
        };
      }
      job.tasks.add(tid);
      taskToJob.set(tid, jid);
      return { ok: true, jobId: jid };
    },

    releaseTask(transferId: string): RoomFileJobId | null {
      const jobId = taskToJob.get(transferId);
      if (!jobId) return null;
      taskToJob.delete(transferId);
      const job = jobs.get(jobId);
      if (job) job.tasks.delete(transferId);
      return jobId;
    },

    close(jobId: RoomFileJobId): void {
      const id = roomFileJobId(jobId);
      const job = jobs.get(id);
      if (!job) return;
      for (const tid of job.tasks) taskToJob.delete(tid);
      jobs.delete(id);
    },

    jobIdForTask(transferId: string): RoomFileJobId | null {
      return taskToJob.get(transferId) ?? null;
    },

    list(): RoomFileJobSnap[] {
      return [...jobs.values()].map(snap);
    },

    size(): number {
      return jobs.size;
    },

    clear(): void {
      jobs.clear();
      taskToJob.clear();
    },
  };
}

export type RoomFileJobRegistry = ReturnType<typeof createRoomFileJobRegistry>;
