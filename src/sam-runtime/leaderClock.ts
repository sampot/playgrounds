/**
 * Clock abstraction for Leader election timing (real or fake for tests).
 */

export interface LeaderClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: LeaderClock = {
  now: () => Date.now(),
  sleep: ms =>
    ms <= 0 ? Promise.resolve() : new Promise(r => setTimeout(r, ms)),
};

/** Deterministic clock for Vitest. */
export class FakeClock implements LeaderClock {
  private t: number;
  private waits: Array<{ until: number; resolve: () => void }> = [];

  constructor(start = 0) {
    this.t = start;
  }

  now(): number {
    return this.t;
  }

  sleep(ms: number): Promise<void> {
    const until = this.t + Math.max(0, ms);
    if (until <= this.t) return Promise.resolve();
    return new Promise(resolve => {
      this.waits.push({ until, resolve });
    });
  }

  /** Advance time and resolve due sleeps. */
  async advance(ms: number): Promise<void> {
    this.t += Math.max(0, ms);
    const due = this.waits.filter(w => w.until <= this.t);
    this.waits = this.waits.filter(w => w.until > this.t);
    for (const w of due) w.resolve();
    // Flush microtasks so awaiters continue.
    await Promise.resolve();
    await Promise.resolve();
  }

  async advanceTo(t: number): Promise<void> {
    if (t > this.t) await this.advance(t - this.t);
  }
}
