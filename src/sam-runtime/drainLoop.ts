/**
 * Single-threaded mailbox drain for one agent (DEC-031 §6.3).
 */

import { N_MAX_ATTEMPTS, RETRY_DELAY_MS } from "./constants.ts";
import type { AgentMessage } from "./message.ts";
import type { MailboxStore } from "./mailboxStore.ts";

export type MessageHandler = (msg: AgentMessage) => Promise<void>;

export type DrainGate = () => boolean | Promise<boolean>;

export interface DrainLoopOptions {
  agentId: string;
  mailbox: MailboxStore;
  handle: MessageHandler;
  /** Return false to stop drain without ack (e.g. lost leadership). */
  canDrain?: DrainGate;
  /** Optional sleep between retries. */
  retryDelayMs?: number;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Drain until mailbox empty or gate fails.
 * Returns number of successfully acked messages.
 */
export async function drainAgent(opts: DrainLoopOptions): Promise<number> {
  const retryDelay = opts.retryDelayMs ?? RETRY_DELAY_MS;
  let acked = 0;
  for (;;) {
    if (opts.canDrain && !(await opts.canDrain())) break;

    const msg = await opts.mailbox.claimNext(opts.agentId);
    if (!msg) break;

    if (opts.canDrain && !(await opts.canDrain())) {
      // Lost authority after claim — put back without incrementing attempts.
      // claimNext already incremented; fail(requeue) keeps attempts.
      await opts.mailbox.fail(opts.agentId, msg.id, { poison: false });
      break;
    }

    try {
      await opts.handle(msg);
      await opts.mailbox.ack(opts.agentId, msg.id);
      acked += 1;
    } catch {
      const poison = msg.deliveryAttempts >= N_MAX_ATTEMPTS;
      await opts.mailbox.fail(opts.agentId, msg.id, { poison });
      if (!poison) {
        await sleep(retryDelay);
      }
      // Continue to next (poison skips; retry re-queued at front — will retry).
      // For retry, claimNext will pick the same message again next loop.
    }
  }
  return acked;
}
