/**
 * Lock abstraction for Leader election (Web Locks in browser; fake in tests).
 */

import { PLAYGROUNDS_AGENT_LEADER_LOCK } from "./constants.ts";

export interface LeaderLockHandle {
  /** Still exclusive holder? */
  isHeld(): boolean;
}

/**
 * Request the exclusive leader lock and run `fn` while held.
 * Resolves when `fn` returns (lock released).
 */
export type LeaderLockRequest = (
  name: string,
  fn: (handle: LeaderLockHandle) => Promise<void>
) => Promise<void>;

/** Browser `navigator.locks` adapter. */
export function createWebLockRequest(
  locks: LockManager = navigator.locks
): LeaderLockRequest {
  return async (name, fn) => {
    await locks.request(name, async () => {
      let held = true;
      try {
        await fn({
          isHeld: () => held,
        });
      } finally {
        held = false;
      }
    });
  };
}

export { PLAYGROUNDS_AGENT_LEADER_LOCK };

/**
 * In-process exclusive lock for Node / Vitest (single shared manager).
 */
export class FakeLockManager {
  private holder: symbol | null = null;
  private queue: Array<() => void> = [];
  private revokeCurrent: (() => void) | null = null;

  request: LeaderLockRequest = async (_name, fn) => {
    const token = Symbol("lock");
    await new Promise<void>(resolveWait => {
      const tryEnter = () => {
        if (this.holder) {
          this.queue.push(tryEnter);
          return;
        }
        this.holder = token;
        resolveWait();
      };
      tryEnter();
    });

    let held = true;
    this.revokeCurrent = () => {
      held = false;
    };
    try {
      await fn({
        isHeld: () => held && this.holder === token,
      });
    } finally {
      held = false;
      this.revokeCurrent = null;
      if (this.holder === token) this.holder = null;
      const next = this.queue.shift();
      if (next) next();
    }
  };

  /**
   * Simulate lost lock (tab freeze / steal) without waiting for callback exit.
   * Holder's `isHeld()` becomes false; they should degrade and exit.
   */
  revoke(): void {
    this.revokeCurrent?.();
  }

  isHeld(): boolean {
    return this.holder !== null;
  }
}
