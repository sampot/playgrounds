/**
 * Fan session events into Agent mailboxes (DEC-031 Phase 5 / DEC-023).
 * BroadcastChannel remains for UI; mailbox is the authoritative handler path.
 */

export type SessionMailboxFanoutItem = {
  agentId: string;
  sandboxId: string;
  seq: number;
  event: unknown;
};

export type SessionMailboxFanout = (
  items: SessionMailboxFanoutItem[]
) => void | Promise<void>;

let fanout: SessionMailboxFanout | null = null;

export function setSessionMailboxFanout(
  next: SessionMailboxFanout | null
): void {
  fanout = next;
}

export async function fanoutSessionEventsToMailboxes(
  items: SessionMailboxFanoutItem[]
): Promise<void> {
  if (!fanout || items.length === 0) return;
  await fanout(items);
}
