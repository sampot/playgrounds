/**
 * Pure Invite handshake queue (FIFO, one answering slot).
 * Used by Durable Object and unit tests.
 */

export type HandshakeSlot = {
  joinId: string;
  offerWire: string;
  createdAt: number;
};

export type InviteRecord = {
  inviteId: string;
  secret: string;
  shortId: string;
  ownerUserId: string;
  kind: string;
  intent: unknown;
  targetField: string;
  createdAt: number;
  expiresAt: number;
  revoked: boolean;
  /** joinCap hash → joinId */
  joins: Record<string, string>;
  /** Waiting offers not yet at head / not answered */
  queue: HandshakeSlot[];
  /** Current head awaiting host answer (null if idle) */
  current: HandshakeSlot | null;
  /** joinId → answer wire once host answered */
  answers: Record<string, string>;
};

export function createInviteRecord(input: {
  inviteId: string;
  secret: string;
  shortId: string;
  ownerUserId: string;
  kind: string;
  intent: unknown;
  targetField: string;
  now: number;
  ttlMs: number;
}): InviteRecord {
  return {
    inviteId: input.inviteId,
    secret: input.secret,
    shortId: input.shortId,
    ownerUserId: input.ownerUserId,
    kind: input.kind,
    intent: input.intent,
    targetField: input.targetField,
    createdAt: input.now,
    expiresAt: input.now + input.ttlMs,
    revoked: false,
    joins: {},
    queue: [],
    current: null,
    answers: {},
  };
}

export function inviteOpen(rec: InviteRecord, now: number): boolean {
  return !rec.revoked && now < rec.expiresAt;
}

export function registerJoin(
  rec: InviteRecord,
  joinCapHash: string,
  joinId: string,
  now: number
): { ok: true } | { ok: false; status: number; error: string } {
  if (!inviteOpen(rec, now)) {
    return { ok: false, status: 410, error: "invite_expired_or_revoked" };
  }
  rec.joins[joinCapHash] = joinId;
  return { ok: true };
}

export function enqueueOffer(
  rec: InviteRecord,
  joinCapHash: string,
  offerWire: string,
  now: number
):
  | { ok: true; joinId: string; position: number }
  | { ok: false; status: number; error: string } {
  if (!inviteOpen(rec, now)) {
    return { ok: false, status: 410, error: "invite_expired_or_revoked" };
  }
  const joinId = rec.joins[joinCapHash];
  if (!joinId) {
    return { ok: false, status: 403, error: "invalid_join_cap" };
  }
  if (rec.answers[joinId]) {
    return { ok: false, status: 409, error: "already_answered" };
  }
  if (
    rec.current?.joinId === joinId ||
    rec.queue.some(s => s.joinId === joinId)
  ) {
    return { ok: false, status: 409, error: "offer_already_queued" };
  }
  const slot: HandshakeSlot = { joinId, offerWire, createdAt: now };
  if (!rec.current) {
    rec.current = slot;
    return { ok: true, joinId, position: 0 };
  }
  rec.queue.push(slot);
  return { ok: true, joinId, position: rec.queue.length };
}

export function peekPending(
  rec: InviteRecord,
  ownerUserId: string
):
  | { ok: true; slot: HandshakeSlot }
  | { ok: false; status: number; error: string; empty?: boolean } {
  if (rec.ownerUserId !== ownerUserId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  if (!rec.current) {
    return { ok: false, status: 404, error: "empty", empty: true };
  }
  return { ok: true, slot: rec.current };
}

export function putAnswer(
  rec: InviteRecord,
  ownerUserId: string,
  answerWire: string,
  now: number
):
  | { ok: true; joinId: string }
  | { ok: false; status: number; error: string } {
  if (rec.ownerUserId !== ownerUserId) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  if (!inviteOpen(rec, now) && !rec.current) {
    return { ok: false, status: 410, error: "invite_expired_or_revoked" };
  }
  if (!rec.current) {
    return { ok: false, status: 404, error: "no_pending_offer" };
  }
  const joinId = rec.current.joinId;
  rec.answers[joinId] = answerWire;
  rec.current = rec.queue.shift() ?? null;
  return { ok: true, joinId };
}

export function getAnswer(
  rec: InviteRecord,
  joinId: string
): string | undefined {
  return rec.answers[joinId];
}

export function revokeInvite(rec: InviteRecord): void {
  rec.revoked = true;
}

/** `invite.room` Guest join uses BoothAnchor, not Invite DO signal queue. */
export function inviteRoomSignalBlocked(kind: string): boolean {
  return kind === "invite.room";
}
