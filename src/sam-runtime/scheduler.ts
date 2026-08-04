/**
 * In-process scheduler for SAM Controller alarms (DEC-024).
 */

import type { ScheduleOptions } from "./types.ts";

export type AlarmCallback = () => void | Promise<void>;

const MAX_PENDING = 64;

export class SamScheduler {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private disposed = false;

  schedule(
    options: ScheduleOptions,
    cb: AlarmCallback
  ): { cancel: () => void } {
    if (this.disposed) {
      return { cancel: () => undefined };
    }
    if (this.timers.size + this.intervals.size >= MAX_PENDING) {
      throw new Error("scheduler_limit: too many pending schedules");
    }

    const run = () => {
      void Promise.resolve()
        .then(() => cb())
        .catch(() => {
          /* swallow — host may log */
        });
    };

    if (options.intervalMs !== undefined) {
      const intervalMs = Math.max(1, Math.floor(options.intervalMs));
      let firstDelay = intervalMs;
      if (options.delayMs !== undefined) {
        firstDelay = Math.max(0, Math.floor(options.delayMs));
      } else if (options.at !== undefined) {
        firstDelay = Math.max(0, Math.floor(options.at - Date.now()));
      }
      let intervalId: ReturnType<typeof setInterval> | null = null;
      const firstId = setTimeout(() => {
        this.timers.delete(firstId);
        run();
        intervalId = setInterval(run, intervalMs);
        this.intervals.add(intervalId);
      }, firstDelay);
      this.timers.add(firstId);
      return {
        cancel: () => {
          clearTimeout(firstId);
          this.timers.delete(firstId);
          if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(intervalId);
          }
        },
      };
    }

    let delay = 0;
    if (options.delayMs !== undefined) {
      delay = Math.max(0, Math.floor(options.delayMs));
    } else if (options.at !== undefined) {
      delay = Math.max(0, Math.floor(options.at - Date.now()));
    }
    const id = setTimeout(() => {
      this.timers.delete(id);
      run();
    }, delay);
    this.timers.add(id);
    return {
      cancel: () => {
        clearTimeout(id);
        this.timers.delete(id);
      },
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const id of this.timers) clearTimeout(id);
    for (const id of this.intervals) clearInterval(id);
    this.timers.clear();
    this.intervals.clear();
  }
}
