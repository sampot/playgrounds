/**
 * Durable per-agent mailbox (DEC-031).
 */

import { DEDUPE_WINDOW_SIZE, MAILBOX_CAPACITY } from "./constants.ts";
import { AgentRuntimeError } from "./errors.ts";
import type { AgentMessage } from "./message.ts";
import { readJson, writeJson, type RuntimeStorage } from "./storage.ts";

export interface MailboxRecord {
  queued: AgentMessage[];
  inFlight: AgentMessage | null;
  /** Recently acked ids (newest last); used for dedupe. */
  ackedIds: string[];
  poison: AgentMessage[];
}

/** Lightweight mailbox stats for fleet projection (DEC-032). */
export interface MailboxSummary {
  depth: number;
  inFlight: boolean;
  poisonCount: number;
}

/** Message header without payload (fleet Focus). */
export interface MailboxMessageHeader {
  id: string;
  from: string;
  to: string;
  type: string;
  sentAt: number;
  deliveryAttempts: number;
  /** queued | inFlight | poison */
  state: "queued" | "inFlight" | "poison";
}

function toHeader(
  m: AgentMessage,
  state: MailboxMessageHeader["state"]
): MailboxMessageHeader {
  return {
    id: m.id,
    from: m.from,
    to: m.to,
    type: m.type,
    sentAt: m.sentAt,
    deliveryAttempts: m.deliveryAttempts,
    state,
  };
}

function emptyRecord(): MailboxRecord {
  return { queued: [], inFlight: null, ackedIds: [], poison: [] };
}

function keyFor(agentId: string): string {
  return `mail/${agentId}/state.json`;
}

export class MailboxStore {
  constructor(private storage: RuntimeStorage) {}

  async load(agentId: string): Promise<MailboxRecord> {
    return readJson(this.storage, keyFor(agentId), emptyRecord());
  }

  private async save(agentId: string, rec: MailboxRecord): Promise<void> {
    await writeJson(this.storage, keyFor(agentId), rec);
  }

  /** Pending work count (queued + inFlight). */
  async pendingCount(agentId: string): Promise<number> {
    const rec = await this.load(agentId);
    return rec.queued.length + (rec.inFlight ? 1 : 0);
  }

  async summarize(agentId: string): Promise<MailboxSummary> {
    const rec = await this.load(agentId);
    return {
      depth: rec.queued.length + (rec.inFlight ? 1 : 0),
      inFlight: Boolean(rec.inFlight),
      poisonCount: rec.poison.length,
    };
  }

  /**
   * Recent message headers (inFlight, then queued head, then poison).
   * No payloads — safe for fleet UI.
   */
  async listMessageHeaders(
    agentId: string,
    limit = 20
  ): Promise<MailboxMessageHeader[]> {
    const rec = await this.load(agentId);
    const out: MailboxMessageHeader[] = [];
    if (rec.inFlight) out.push(toHeader(rec.inFlight, "inFlight"));
    for (const m of rec.queued) {
      if (out.length >= limit) break;
      out.push(toHeader(m, "queued"));
    }
    for (const m of rec.poison) {
      if (out.length >= limit) break;
      out.push(toHeader(m, "poison"));
    }
    return out.slice(0, limit);
  }

  async discardPoison(agentId: string, messageId: string): Promise<boolean> {
    const rec = await this.load(agentId);
    const before = rec.poison.length;
    rec.poison = rec.poison.filter(m => m.id !== messageId);
    if (rec.poison.length === before) return false;
    await this.save(agentId, rec);
    return true;
  }

  /** Move a poison message back to the front of the queue for retry. */
  async requeuePoison(agentId: string, messageId: string): Promise<boolean> {
    const rec = await this.load(agentId);
    const idx = rec.poison.findIndex(m => m.id === messageId);
    if (idx < 0) return false;
    const [msg] = rec.poison.splice(idx, 1);
    if (!msg) return false;
    const used = rec.queued.length + (rec.inFlight ? 1 : 0);
    if (used >= MAILBOX_CAPACITY) {
      rec.poison.splice(idx, 0, msg);
      throw new AgentRuntimeError(
        "mailbox_full",
        `mailbox full for ${agentId}`
      );
    }
    msg.deliveryAttempts = 0;
    rec.queued.unshift(msg);
    await this.save(agentId, rec);
    return true;
  }

  async enqueue(agentId: string, msg: AgentMessage): Promise<AgentMessage> {
    const rec = await this.load(agentId);
    if (rec.ackedIds.includes(msg.id)) {
      // Already processed — treat as success (idempotent send).
      return msg;
    }
    if (
      rec.queued.some(m => m.id === msg.id) ||
      (rec.inFlight && rec.inFlight.id === msg.id)
    ) {
      return msg;
    }
    if (rec.poison.some(m => m.id === msg.id)) {
      throw new AgentRuntimeError(
        "mailbox_poisoned",
        `message ${msg.id} is in DLQ`
      );
    }
    const used = rec.queued.length + (rec.inFlight ? 1 : 0);
    if (used >= MAILBOX_CAPACITY) {
      throw new AgentRuntimeError(
        "mailbox_full",
        `mailbox full for ${agentId}`
      );
    }
    rec.queued.push(msg);
    await this.save(agentId, rec);
    return msg;
  }

  /**
   * Claim next message (prefer restoring inFlight after crash).
   * Returns null if empty.
   */
  async claimNext(agentId: string): Promise<AgentMessage | null> {
    const rec = await this.load(agentId);
    if (rec.inFlight) {
      return { ...rec.inFlight };
    }
    const next = rec.queued.shift();
    if (!next) return null;
    next.deliveryAttempts += 1;
    rec.inFlight = next;
    await this.save(agentId, rec);
    return { ...next };
  }

  async ack(agentId: string, messageId: string): Promise<void> {
    const rec = await this.load(agentId);
    if (!rec.inFlight || rec.inFlight.id !== messageId) return;
    rec.inFlight = null;
    rec.ackedIds.push(messageId);
    while (rec.ackedIds.length > DEDUPE_WINDOW_SIZE) {
      rec.ackedIds.shift();
    }
    await this.save(agentId, rec);
  }

  /** Leave inFlight cleared and re-queue (or poison) after failure. */
  async fail(
    agentId: string,
    messageId: string,
    opts: { poison: boolean }
  ): Promise<void> {
    const rec = await this.load(agentId);
    if (!rec.inFlight || rec.inFlight.id !== messageId) return;
    const msg = rec.inFlight;
    rec.inFlight = null;
    if (opts.poison) {
      rec.poison.push(msg);
    } else {
      rec.queued.unshift(msg);
    }
    await this.save(agentId, rec);
  }

  async listPoison(agentId: string): Promise<AgentMessage[]> {
    const rec = await this.load(agentId);
    return rec.poison.map(m => ({ ...m }));
  }

  async clear(agentId: string): Promise<void> {
    await this.storage.delete(keyFor(agentId));
  }
}
