/**
 * Durable alarm schedule table (DEC-031 §6.4).
 * Due alarms become serial events (system.alarm) via mailbox enqueue.
 */

import type { ScheduleOptions } from "./types.ts";
import { readJson, writeJson, type RuntimeStorage } from "./storage.ts";
import { newMessageId } from "./message.ts";

export interface AlarmEntry {
  id: string;
  agentId: string;
  /** Next fire time (epoch ms). */
  nextAt: number;
  intervalMs?: number;
  cancelled: boolean;
}

interface AlarmTable {
  entries: AlarmEntry[];
}

const KEY = "alarms.json";

function emptyTable(): AlarmTable {
  return { entries: [] };
}

export class AlarmStore {
  private table: AlarmTable = emptyTable();
  private ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private storage: RuntimeStorage) {
    this.ready = readJson(this.storage, KEY, emptyTable()).then(t => {
      this.table = t;
    });
  }

  async flush(): Promise<void> {
    await this.ready;
    await this.writeChain;
  }

  private persist(): void {
    const snapshot: AlarmTable = {
      entries: this.table.entries.map(e => ({ ...e })),
    };
    this.writeChain = this.writeChain.then(() =>
      writeJson(this.storage, KEY, snapshot)
    );
  }

  schedule(
    agentId: string,
    options: ScheduleOptions,
    now = Date.now()
  ): { id: string; cancel: () => void } {
    const id = newMessageId();
    let nextAt = now;
    if (options.at !== undefined) {
      nextAt = Math.floor(options.at);
    } else if (options.delayMs !== undefined) {
      nextAt = now + Math.max(0, Math.floor(options.delayMs));
    } else if (options.intervalMs !== undefined) {
      nextAt = now + Math.max(1, Math.floor(options.intervalMs));
    }

    const entry: AlarmEntry = {
      id,
      agentId,
      nextAt,
      intervalMs:
        options.intervalMs !== undefined
          ? Math.max(1, Math.floor(options.intervalMs))
          : undefined,
      cancelled: false,
    };

    this.table.entries.push(entry);
    this.persist();

    return {
      id,
      cancel: () => {
        this.cancelById(id);
      },
    };
  }

  cancelById(id: string): void {
    const e = this.table.entries.find(x => x.id === id);
    if (e) e.cancelled = true;
    this.table.entries = this.table.entries.filter(x => !x.cancelled);
    this.persist();
  }

  /**
   * Collect due alarms; advance interval (skip missed ticks — PLAN).
   */
  async collectDue(now = Date.now()): Promise<AlarmEntry[]> {
    await this.ready;
    const due: AlarmEntry[] = [];
    const keep: AlarmEntry[] = [];
    for (const e of this.table.entries) {
      if (e.cancelled) continue;
      if (e.nextAt > now) {
        keep.push(e);
        continue;
      }
      due.push({ ...e });
      if (e.intervalMs !== undefined) {
        let next = e.nextAt + e.intervalMs;
        while (next <= now) next += e.intervalMs;
        keep.push({ ...e, nextAt: next });
      }
    }
    this.table.entries = keep;
    this.persist();
    await this.flush();
    return due;
  }

  async listForAgent(agentId: string): Promise<AlarmEntry[]> {
    await this.ready;
    return this.table.entries
      .filter(e => e.agentId === agentId && !e.cancelled)
      .map(e => ({ ...e }));
  }
}
