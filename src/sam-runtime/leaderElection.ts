/**
 * Single Leader election: Web Lock + heartbeat + leaderEpoch (DEC-031 Phase 2).
 */

import {
  PLAYGROUNDS_AGENT_LEADER_LOCK,
  T_HEARTBEAT_MS,
  T_SELF_CHECK_MS,
  T_TAKEOVER_MS,
} from "./constants.ts";
import { AgentRuntimeError } from "./errors.ts";
import { realClock, type LeaderClock } from "./leaderClock.ts";
import type { LeaderLockHandle, LeaderLockRequest } from "./leaderLock.ts";
import { LeaderStore, type LeaderState } from "./leaderStore.ts";
import type { RuntimeStorage } from "./storage.ts";

export type LeaderRole = "follower" | "pending" | "leader";

export interface LeaderElectionOptions {
  peerId: string;
  storage: RuntimeStorage;
  requestLock: LeaderLockRequest;
  clock?: LeaderClock;
  tHeartbeatMs?: number;
  tTakeoverMs?: number;
  tSelfCheckMs?: number;
  /** Poll interval while following (default: T_heartbeat / 2). */
  pollMs?: number;
  onBecameLeader?: (epoch: number) => void | Promise<void>;
  onLostLeadership?: (reason: string) => void | Promise<void>;
}

export class LeaderElection {
  readonly peerId: string;
  private store: LeaderStore;
  private requestLock: LeaderLockRequest;
  private clock: LeaderClock;
  private tHeartbeat: number;
  private tTakeover: number;
  private tSelfCheck: number;
  private pollMs: number;
  private onBecameLeader?: LeaderElectionOptions["onBecameLeader"];
  private onLostLeadership?: LeaderElectionOptions["onLostLeadership"];

  private role: LeaderRole = "follower";
  private epoch = 0;
  private running = false;
  private stopLeadership: (() => void) | null = null;
  private sleepCancel: (() => void) | null = null;
  private loopPromise: Promise<void> | null = null;
  private lockHandle: LeaderLockHandle | null = null;

  constructor(opts: LeaderElectionOptions) {
    this.peerId = opts.peerId;
    this.store = new LeaderStore(opts.storage);
    this.requestLock = opts.requestLock;
    this.clock = opts.clock ?? realClock;
    this.tHeartbeat = opts.tHeartbeatMs ?? T_HEARTBEAT_MS;
    this.tTakeover = opts.tTakeoverMs ?? T_TAKEOVER_MS;
    this.tSelfCheck = opts.tSelfCheckMs ?? T_SELF_CHECK_MS;
    this.pollMs = opts.pollMs ?? Math.max(50, Math.floor(this.tHeartbeat / 2));
    this.onBecameLeader = opts.onBecameLeader;
    this.onLostLeadership = opts.onLostLeadership;
  }

  getRole(): LeaderRole {
    return this.role;
  }

  getEpoch(): number {
    return this.epoch;
  }

  isLeader(): boolean {
    return this.role === "leader";
  }

  /** True only when inaugurated and still holding the lock. */
  canDrain(): boolean {
    return (
      this.role === "leader" &&
      this.lockHandle !== null &&
      this.lockHandle.isHeld()
    );
  }

  /** Start follower loop (contends when heartbeat stale). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.followerLoop();
  }

  /** Stop loops and abdicate if leading. */
  async stop(): Promise<void> {
    this.running = false;
    this.sleepCancel?.();
    this.sleepCancel = null;
    if (this.stopLeadership) {
      this.stopLeadership();
      this.stopLeadership = null;
    }
    if (this.loopPromise) {
      await this.loopPromise.catch(() => undefined);
      this.loopPromise = null;
    }
    if (this.role !== "follower") {
      await this.degrade("stopped");
    }
  }

  /** Actively release leadership (shortens others' wait). */
  async abdicate(): Promise<void> {
    this.sleepCancel?.();
    if (this.stopLeadership) {
      this.stopLeadership();
      this.stopLeadership = null;
    }
    await this.degrade("abdicated");
  }

  /** Interruptible sleep — cancelled by stop()/abdicate(). */
  private sleepOrStop(ms: number): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        if (this.sleepCancel === finish) this.sleepCancel = null;
        resolve();
      };
      this.sleepCancel = finish;
      void this.clock.sleep(ms).then(finish);
    });
  }

  private async followerLoop(): Promise<void> {
    while (this.running) {
      if (this.role === "leader" || this.role === "pending") {
        await this.sleepOrStop(this.pollMs);
        continue;
      }
      try {
        if (await this.shouldContend()) {
          await this.tryBecomeLeader();
        }
      } catch {
        /* ignore contention races */
      }
      if (!this.running) break;
      await this.sleepOrStop(this.pollMs);
    }
  }

  private async shouldContend(): Promise<boolean> {
    const hb = await this.store.read();
    if (!hb || hb.status !== "formal") return true;
    return this.clock.now() - hb.at > this.tHeartbeat;
  }

  private async tryBecomeLeader(): Promise<void> {
    if (!this.running || this.role !== "follower") return;

    await this.requestLock(PLAYGROUNDS_AGENT_LEADER_LOCK, async handle => {
      if (!this.running) return;
      this.lockHandle = handle;
      this.role = "pending";

      // Buffer: do not write formal heartbeat yet.
      await this.sleepOrStop(this.tTakeover);
      if (!this.running || !handle.isHeld()) {
        this.lockHandle = null;
        this.role = "follower";
        return;
      }

      const prev = await this.store.read();
      const nextEpoch = (prev?.epoch ?? 0) + 1;
      this.epoch = nextEpoch;
      const formal: LeaderState = {
        epoch: nextEpoch,
        at: this.clock.now(),
        peerId: this.peerId,
        status: "formal",
      };
      await this.store.write(formal);
      this.role = "leader";
      await this.onBecameLeader?.(nextEpoch);

      // Stay inside lock callback until abdicate / degrade / stop.
      await new Promise<void>(resolve => {
        this.stopLeadership = resolve;
        void this.leaderWorkLoop(handle).finally(resolve);
      });

      this.stopLeadership = null;
      this.lockHandle = null;
      if (this.role === "leader" || this.role === "pending") {
        await this.degrade("lock_released");
      }
    });
  }

  private async leaderWorkLoop(handle: LeaderLockHandle): Promise<void> {
    while (this.running && this.role === "leader") {
      if (!handle.isHeld() || !(await this.epochStillValid())) {
        await this.degrade("lost_authority");
        return;
      }
      await this.store.write({
        epoch: this.epoch,
        at: this.clock.now(),
        peerId: this.peerId,
        status: "formal",
      });
      await this.sleepOrStop(this.tSelfCheck);
    }
  }

  private async epochStillValid(): Promise<boolean> {
    const hb = await this.store.read();
    if (!hb || hb.status !== "formal") return false;
    return hb.epoch === this.epoch && hb.peerId === this.peerId;
  }

  private async degrade(reason: string): Promise<void> {
    const wasLeader = this.role === "leader" || this.role === "pending";
    this.role = "follower";
    this.lockHandle = null;
    if (this.stopLeadership) {
      const stop = this.stopLeadership;
      this.stopLeadership = null;
      stop();
    }
    if (wasLeader) {
      await this.onLostLeadership?.(reason);
    }
  }

  /** Assert leadership before authoritative drain / heartbeat write. */
  assertCanDrain(): void {
    if (!this.canDrain()) {
      throw new AgentRuntimeError("not_leader", "not the active Leader");
    }
  }
}
