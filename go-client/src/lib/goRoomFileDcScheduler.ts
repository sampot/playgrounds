/**
 * Shared DataChannel pump scheduler for *already-admitted* session_file tasks.
 * Does not invent HTTP／Ranges — only shares one physical DC across jobs
 * (clients) and their tasks (transferIds).
 */

/** Chunks per quantum before re-picking (~64 KiB at 16 KiB payload). */
export const DC_SCHED_QUANTUM_CHUNKS = 4;

export const DC_PRIORITY = {
  /** User-initiated download (stream-through save). */
  SAVE: 80,
  /** Media / preview Range (play). */
  PLAY: 50,
  /** Untagged request. */
  DEFAULT: 40,
} as const;

export type DcTransferPurpose = "save" | "play";

export function priorityForPurpose(
  purpose: DcTransferPurpose | undefined
): number {
  if (purpose === "save") return DC_PRIORITY.SAVE;
  if (purpose === "play") return DC_PRIORITY.PLAY;
  return DC_PRIORITY.DEFAULT;
}

export type DcSchedPickable = {
  id: string;
  /** Product job id (file id). Defaults to task id when omitted. */
  jobId?: string;
  priority: number;
  paused: boolean;
  abort: boolean;
};

/**
 * How many consecutive quanta a *job* may keep before yielding to another job.
 * Higher priority → more streak (save gets more DC time than prefetch).
 */
export function dcPriorityQuantumWeight(priority: number): number {
  return Math.max(1, Math.ceil(priority / 40));
}

/**
 * Job-level pick: highest priority among ready jobs, with anti-starvation streak.
 * `id` here is the job id (not a transferId).
 */
export function pickNextDcJob<T extends DcSchedPickable>(
  jobs: readonly T[],
  lastServedId: string | null,
  streak = 0
): T | null {
  const ready = jobs.filter((j) => !j.paused && !j.abort);
  if (ready.length === 0) return null;

  const last = lastServedId
    ? ready.find((j) => j.id === lastServedId)
    : undefined;
  if (
    last &&
    streak > 0 &&
    streak < dcPriorityQuantumWeight(last.priority)
  ) {
    return last;
  }

  const pool =
    last && ready.length > 1
      ? ready.filter((j) => j.id !== last.id)
      : ready;

  let maxP = pool[0]!.priority;
  for (let i = 1; i < pool.length; i++) {
    const p = pool[i]!.priority;
    if (p > maxP) maxP = p;
  }
  const top = pool.filter((j) => j.priority === maxP);
  if (top.length === 1) return top[0]!;
  const ring = ready.filter((j) => j.priority === maxP);
  if (lastServedId) {
    const idx = ring.findIndex((j) => j.id === lastServedId);
    if (idx >= 0) {
      for (let step = 1; step <= ring.length; step++) {
        const cand = ring[(idx + step) % ring.length]!;
        if (top.some((t) => t.id === cand.id)) return cand;
      }
    }
  }
  return top[0]!;
}

/**
 * Two-level pick: choose job (priority＋streak), then a ready task inside that job.
 */
export function pickNextDcTask<T extends DcSchedPickable>(
  tasks: readonly T[],
  lastServedTaskId: string | null,
  lastServedJobId: string | null,
  jobStreak = 0
): T | null {
  const ready = tasks.filter((t) => !t.paused && !t.abort);
  if (ready.length === 0) return null;

  const byJob = new Map<string, T[]>();
  for (const t of ready) {
    const jid = t.jobId ?? t.id;
    const list = byJob.get(jid) ?? [];
    list.push(t);
    byJob.set(jid, list);
  }

  const jobHandles: DcSchedPickable[] = [...byJob.entries()].map(
    ([jobId, ts]) => ({
      id: jobId,
      jobId,
      priority: Math.max(...ts.map((t) => t.priority)),
      paused: false,
      abort: false,
    })
  );

  const pickedJob = pickNextDcJob(jobHandles, lastServedJobId, jobStreak);
  if (!pickedJob) return null;
  const inJob = byJob.get(pickedJob.id)!;
  if (inJob.length === 1) return inJob[0]!;

  let maxP = inJob[0]!.priority;
  for (let i = 1; i < inJob.length; i++) {
    if (inJob[i]!.priority > maxP) maxP = inJob[i]!.priority;
  }
  const top = inJob.filter((t) => t.priority === maxP);
  if (top.length === 1) return top[0]!;
  if (lastServedTaskId) {
    const idx = top.findIndex((t) => t.id === lastServedTaskId);
    if (idx >= 0) return top[(idx + 1) % top.length]!;
    const inFull = inJob.findIndex((t) => t.id === lastServedTaskId);
    if (inFull >= 0) {
      for (let step = 1; step <= inJob.length; step++) {
        const cand = inJob[(inFull + step) % inJob.length]!;
        if (top.some((t) => t.id === cand.id)) return cand;
      }
    }
  }
  return top[0]!;
}

export type DcSchedSendOne = () => Promise<"more" | "done">;

export type DcSchedEnqueue = {
  id: string;
  /** Product job (file id). Defaults to transfer id. */
  jobId?: string;
  priority?: number;
  destPeerId?: string;
  sendOne: DcSchedSendOne;
  onComplete: () => void;
  onError: (e: unknown) => void;
  /** Task aborted via abort() — no more bytes; do not send owner `done`. */
  onAbort?: () => void;
};

/**
 * Single sender loop: pick job → task → quantum of sendOne → re-pick.
 */
export function createDcPumpScheduler(opts: {
  quantumChunks?: number;
  waitDrain: (destPeerId?: string) => Promise<void>;
}) {
  const quantum = Math.max(1, opts.quantumChunks ?? DC_SCHED_QUANTUM_CHUNKS);
  type Task = {
    id: string;
    jobId: string;
    priority: number;
    destPeerId?: string;
    paused: boolean;
    abort: boolean;
    sendOne: DcSchedSendOne;
    onComplete: () => void;
    onError: (e: unknown) => void;
    onAbort?: () => void;
  };
  const tasks = new Map<string, Task>();
  let lastServedTaskId: string | null = null;
  let lastServedJobId: string | null = null;
  let jobStreak = 0;
  let loopRunning = false;

  function kick(): void {
    if (loopRunning) return;
    queueMicrotask(() => {
      if (loopRunning || tasks.size === 0) return;
      void runLoop();
    });
  }

  function clearStreak(): void {
    lastServedTaskId = null;
    lastServedJobId = null;
    jobStreak = 0;
  }

  async function runLoop(): Promise<void> {
    if (loopRunning) return;
    loopRunning = true;
    try {
      while (tasks.size > 0) {
        const list = [...tasks.values()];
        const next = pickNextDcTask(
          list,
          lastServedTaskId,
          lastServedJobId,
          jobStreak
        );
        if (!next) {
          for (const t of [...tasks.values()]) {
            if (t.abort) {
              tasks.delete(t.id);
              t.onAbort?.();
            }
          }
          if (tasks.size === 0) break;
          await new Promise((r) => setTimeout(r, 16));
          continue;
        }
        if (next.abort) {
          tasks.delete(next.id);
          next.onAbort?.();
          clearStreak();
          continue;
        }
        if (next.jobId === lastServedJobId) jobStreak += 1;
        else {
          lastServedJobId = next.jobId;
          jobStreak = 1;
        }
        lastServedTaskId = next.id;
        try {
          for (let i = 0; i < quantum; i++) {
            if (next.abort) break;
            if (next.paused) break;
            if (!tasks.has(next.id)) break;
            await opts.waitDrain(next.destPeerId);
            if (next.abort || next.paused || !tasks.has(next.id)) break;
            const result = await next.sendOne();
            if (result === "done") {
              tasks.delete(next.id);
              next.onComplete();
              clearStreak();
              break;
            }
          }
          if (next.abort && tasks.has(next.id)) {
            tasks.delete(next.id);
            next.onAbort?.();
            clearStreak();
          }
        } catch (e) {
          tasks.delete(next.id);
          next.onError(e);
          clearStreak();
        }
      }
    } finally {
      loopRunning = false;
      if (tasks.size > 0) kick();
    }
  }

  return {
    enqueue(spec: DcSchedEnqueue): void {
      if (tasks.has(spec.id)) return;
      tasks.set(spec.id, {
        id: spec.id,
        jobId: spec.jobId ?? spec.id,
        priority: spec.priority ?? DC_PRIORITY.DEFAULT,
        destPeerId: spec.destPeerId,
        paused: false,
        abort: false,
        sendOne: spec.sendOne,
        onComplete: spec.onComplete,
        onError: spec.onError,
        onAbort: spec.onAbort,
      });
      kick();
    },
    setPaused(id: string, paused: boolean): void {
      const t = tasks.get(id);
      if (t) {
        t.paused = paused;
        if (!paused) kick();
      }
    },
    setPriority(id: string, priority: number): void {
      const t = tasks.get(id);
      if (t) t.priority = priority;
    },
    abort(id: string): void {
      const t = tasks.get(id);
      if (t) {
        t.abort = true;
        kick();
      }
    },
    has(id: string): boolean {
      return tasks.has(id);
    },
    get(
      id: string
    ):
      | { paused: boolean; abort: boolean; priority: number; jobId: string }
      | undefined {
      const t = tasks.get(id);
      if (!t) return undefined;
      return {
        paused: t.paused,
        abort: t.abort,
        priority: t.priority,
        jobId: t.jobId,
      };
    },
    size(): number {
      return tasks.size;
    },
    remove(id: string): void {
      tasks.delete(id);
    },
    abortAll(): void {
      for (const t of tasks.values()) t.abort = true;
      kick();
    },
    clear(): void {
      tasks.clear();
    },
  };
}

export type DcPumpScheduler = ReturnType<typeof createDcPumpScheduler>;
