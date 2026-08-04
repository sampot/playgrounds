/**
 * Agent runtime hub: registry + mailbox + alarms + drain (DEC-031 Phase 1).
 * Single-process fake Leader (no Web Lock yet).
 */

import { AlarmStore } from "./alarmStore.ts";
import { drainAgent } from "./drainLoop.ts";
import { AgentRuntimeError } from "./errors.ts";
import { MailboxStore } from "./mailboxStore.ts";
import {
  createAgentMessage,
  type AgentMessage,
  type AgentMessageFrom,
} from "./message.ts";
import { AgentRegistry } from "./registry.ts";
import { createMemoryStorage, type RuntimeStorage } from "./storage.ts";
import type { SamInstance } from "./instance.ts";
import type { ScheduleOptions } from "./types.ts";

export interface AgentRuntimeOptions {
  storage?: RuntimeStorage;
  /** Default true: auto-drain after enqueue / alarm collect. */
  autoDrain?: boolean;
  /**
   * Optional leadership gate (Phase 2). When set, drain only runs while
   * `election.canDrain()` is true. `setLeader` still works for tests.
   */
  election?: {
    canDrain(): boolean;
    isLeader(): boolean;
  };
  /**
   * Fired after a message is Durable-enqueued (DEC-032 traffic sampling).
   * Must not throw; must not await drain. Payload is never passed.
   */
  onMessageEnqueued?: (info: {
    from: string;
    to: string;
    type: string;
    sentAt: number;
  }) => void;
}

export interface SpawnOptions {
  /** Code/files provider — host supplies. */
  createInstance: (sandboxId: string) => Promise<SamInstance> | SamInstance;
  sandboxId?: string;
  agentId?: string;
  name?: string;
  initialMessage?: {
    type: string;
    payload?: unknown;
    from?: AgentMessageFrom;
  };
}

export class AgentRuntime {
  readonly storage: RuntimeStorage;
  readonly registry: AgentRegistry;
  readonly mailbox: MailboxStore;
  readonly alarms: AlarmStore;
  private autoDrain: boolean;
  private live = new Map<string, SamInstance>();
  private drainChain: Promise<void> = Promise.resolve();
  /** >0 while inside runDrainPass — send must not await kickDrain (deadlock). */
  private drainDepth = 0;
  private needsAnotherPass = false;
  private leader = true;
  private election: AgentRuntimeOptions["election"];
  private onMessageEnqueued: AgentRuntimeOptions["onMessageEnqueued"];

  constructor(opts: AgentRuntimeOptions = {}) {
    this.storage = opts.storage ?? createMemoryStorage();
    this.registry = new AgentRegistry(this.storage);
    this.mailbox = new MailboxStore(this.storage);
    this.alarms = new AlarmStore(this.storage);
    this.autoDrain = opts.autoDrain !== false;
    this.election = opts.election;
    this.onMessageEnqueued = opts.onMessageEnqueued;
    if (this.election) this.leader = this.election.isLeader();
  }

  /** Bind or replace enqueue observer (fleet traffic). */
  setOnMessageEnqueued(hook: AgentRuntimeOptions["onMessageEnqueued"]): void {
    this.onMessageEnqueued = hook;
  }

  /** Manual leadership (tests / hosts without election). */
  setLeader(isLeader: boolean): void {
    this.leader = isLeader;
  }

  /** Bind or replace election gate after construct. */
  setElection(election: AgentRuntimeOptions["election"]): void {
    this.election = election;
    if (election) this.leader = election.isLeader();
  }

  isLeader(): boolean {
    if (this.election) return this.election.isLeader();
    return this.leader;
  }

  private mayDrain(): boolean {
    if (this.election) return this.election.canDrain();
    return this.leader;
  }

  getLive(agentId: string): SamInstance | undefined {
    return this.live.get(agentId);
  }

  async attach(
    instance: SamInstance,
    opts?: {
      agentId?: string;
      name?: string;
    }
  ): Promise<{ agentId: string; sandboxId: string }> {
    const sandboxId = instance.id;
    const agentId = opts?.agentId ?? sandboxId;
    instance.attachRuntime(this, agentId);
    this.live.set(agentId, instance);
    await this.registry.register({
      agentId,
      sandboxId,
      status: "running",
      name: opts?.name ?? instance.getMeta().name,
    });
    if (this.autoDrain) void this.kickDrain();
    return { agentId, sandboxId };
  }

  async detach(agentId: string): Promise<void> {
    const inst = this.live.get(agentId);
    if (inst) {
      inst.detachRuntime();
      this.live.delete(agentId);
    }
    await this.registry.unregister(agentId);
  }

  async send(input: {
    to: string;
    type: string;
    payload?: unknown;
    from?: AgentMessageFrom;
    id?: string;
    replyTo?: string;
  }): Promise<{ id: string }> {
    await this.registry.require(input.to);
    const msg = createAgentMessage({
      id: input.id,
      from: input.from ?? "system",
      to: input.to,
      type: input.type,
      payload: input.payload,
      replyTo: input.replyTo,
    });
    await this.mailbox.enqueue(input.to, msg);
    try {
      this.onMessageEnqueued?.({
        from: msg.from,
        to: msg.to,
        type: msg.type,
        sentAt: msg.sentAt,
      });
    } catch {
      /* observer must not break send */
    }
    // Never await drain from send: callers (onCommand/onMessage) may hold the
    // instance serial lock; awaiting drain would deadlock on dispatchMessage.
    if (this.autoDrain) {
      if (this.drainDepth > 0) this.needsAnotherPass = true;
      else void this.kickDrain();
    }
    return { id: msg.id };
  }

  async sendSelf(
    agentId: string,
    input: { type: string; payload?: unknown; id?: string; replyTo?: string }
  ): Promise<{ id: string }> {
    return this.send({
      to: agentId,
      from: agentId,
      type: input.type,
      payload: input.payload,
      id: input.id,
      replyTo: input.replyTo,
    });
  }

  schedule(
    agentId: string,
    options: ScheduleOptions
  ): { id: string; cancel: () => void } {
    const handle = this.alarms.schedule(agentId, options);
    if (this.autoDrain) {
      // Wake drain shortly so due collection runs.
      const delay =
        options.delayMs ??
        (options.at !== undefined
          ? Math.max(0, options.at - Date.now())
          : (options.intervalMs ?? 0));
      setTimeout(() => void this.kickDrain(), Math.max(0, delay));
    }
    return {
      id: handle.id,
      cancel: () => {
        void handle.cancel();
      },
    };
  }

  async spawn(opts: SpawnOptions): Promise<{
    sandboxId: string;
    agentId: string;
  }> {
    const sandboxId =
      opts.sandboxId ??
      `spawn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = opts.agentId ?? sandboxId;
    const inst = await opts.createInstance(sandboxId);
    if (!inst.started) await inst.start();
    await this.attach(inst, { agentId, name: opts.name });
    if (opts.initialMessage) {
      await this.send({
        to: agentId,
        from: opts.initialMessage.from ?? "system",
        type: opts.initialMessage.type,
        payload: opts.initialMessage.payload,
      });
    }
    return { sandboxId, agentId };
  }

  /** Collect due alarms into mailboxes, then drain all live agents. */
  kickDrain(): Promise<void> {
    // Serialize drain requests so callers can always await completion.
    this.drainChain = this.drainChain
      .then(() => this.runDrainPass())
      .catch(() => undefined);
    return this.drainChain;
  }

  private async runDrainPass(): Promise<void> {
    if (!this.mayDrain()) return;
    this.drainDepth += 1;
    try {
      do {
        this.needsAnotherPass = false;
        await this.collectAlarmsIntoMailboxes();
        for (const agentId of this.live.keys()) {
          if (!this.mayDrain()) return;
          await this.drainOne(agentId);
        }
        // Also continue if same-agent sendSelf left pending work.
        let pending = 0;
        for (const agentId of this.live.keys()) {
          pending += await this.mailbox.pendingCount(agentId);
        }
        if (pending > 0) this.needsAnotherPass = true;
      } while (this.needsAnotherPass);
    } finally {
      this.drainDepth -= 1;
    }
  }

  private async collectAlarmsIntoMailboxes(): Promise<void> {
    const due = await this.alarms.collectDue();
    for (const a of due) {
      try {
        await this.registry.require(a.agentId);
      } catch {
        continue;
      }
      const msg = createAgentMessage({
        from: "system",
        to: a.agentId,
        type: "system.alarm",
        payload: { alarmId: a.id },
      });
      try {
        await this.mailbox.enqueue(a.agentId, msg);
      } catch (e) {
        if (
          e instanceof AgentRuntimeError &&
          (e.code === "mailbox_full" || e.code === "mailbox_poisoned")
        ) {
          continue;
        }
        throw e;
      }
    }
  }

  private async drainOne(agentId: string): Promise<void> {
    const inst = this.live.get(agentId);
    if (!inst) return;

    // Dehibernate if paused and work pending.
    const pending = await this.mailbox.pendingCount(agentId);
    if (pending > 0 && inst.isPaused()) {
      await inst.resumeProcess();
      await this.registry.setStatus(agentId, "running");
    }
    if (!inst.started || inst.isPaused()) return;

    await drainAgent({
      agentId,
      mailbox: this.mailbox,
      canDrain: () => this.mayDrain(),
      handle: async (msg: AgentMessage) => {
        await inst.dispatchMessage(msg);
      },
    });
  }

  async pauseAgent(agentId: string): Promise<void> {
    const inst = this.live.get(agentId);
    if (!inst) throw new AgentRuntimeError("agent_not_found", agentId);
    await inst.pauseProcess();
    await this.registry.setStatus(agentId, "hibernated");
  }
}
