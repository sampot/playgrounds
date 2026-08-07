/**
 * Platform credits + turn.hosted entitlement (PG-PLATFORM-CREDITS-PLAN).
 */

import {
  getUser,
  putUser,
  type EnvStore,
  type PlatformUser,
} from "./auth.js";

export type CreditLedgerEntry = {
  id: string;
  at: number;
  /** Positive = credit added; negative = debit */
  delta: number;
  balanceAfter: number;
  reason: string;
  sessionId?: string;
  note?: string;
};

const LEDGER = (userId: string) => `user:${userId}:credit_ledger`;
const LEDGER_MAX = 100;

export function userCredits(user: PlatformUser): number {
  return typeof user.credits === "number" && Number.isFinite(user.credits)
    ? Math.max(0, Math.floor(user.credits))
    : 0;
}

export function userTurnHosted(user: PlatformUser): boolean {
  return Boolean(user.turnHosted);
}

/** User opted in to use relay (dash preference). */
export function userTurnPrefer(user: PlatformUser): boolean {
  return Boolean(user.turnPrefer);
}

/** Ready to mint TURN: admin entitled + user prefers + not disabled. */
export function userMayMintTurn(user: PlatformUser): boolean {
  return userTurnHosted(user) && userTurnPrefer(user) && !user.disabled;
}

async function readLedger(
  store: EnvStore,
  userId: string
): Promise<CreditLedgerEntry[]> {
  const raw = await store.get(LEDGER(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CreditLedgerEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeLedger(
  store: EnvStore,
  userId: string,
  entries: CreditLedgerEntry[]
): Promise<void> {
  await store.put(LEDGER(userId), JSON.stringify(entries.slice(0, LEDGER_MAX)));
}

export async function addCredits(
  store: EnvStore,
  userId: string,
  amount: number,
  note?: string
): Promise<
  | { ok: true; balance: number; entry: CreditLedgerEntry }
  | { ok: false; error: string }
> {
  const n = Math.floor(amount);
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, error: "invalid_amount" };
  }
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.disabled) return { ok: false, error: "user_disabled" };
  const balance = userCredits(user) + n;
  user.credits = balance;
  await putUser(store, user);
  const entry: CreditLedgerEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    delta: n,
    balanceAfter: balance,
    reason: "admin_topup",
    note: note?.trim() || undefined,
  };
  const ledger = await readLedger(store, userId);
  ledger.unshift(entry);
  await writeLedger(store, userId, ledger);
  return { ok: true, balance, entry };
}

export async function setTurnHosted(
  store: EnvStore,
  userId: string,
  enabled: boolean
): Promise<
  | { ok: true; turnHosted: boolean }
  | { ok: false; error: string }
> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.disabled) return { ok: false, error: "user_disabled" };
  if (enabled) user.turnHosted = true;
  else {
    delete user.turnHosted;
    delete user.turnPrefer;
  }
  await putUser(store, user);
  return { ok: true, turnHosted: Boolean(user.turnHosted) };
}

export async function setTurnPrefer(
  store: EnvStore,
  userId: string,
  prefer: boolean
): Promise<
  | { ok: true; turnPrefer: boolean; turnHosted: boolean }
  | { ok: false; error: string }
> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.disabled) return { ok: false, error: "user_disabled" };
  if (prefer && !userTurnHosted(user)) {
    return { ok: false, error: "turn_not_entitled" };
  }
  if (prefer) user.turnPrefer = true;
  else delete user.turnPrefer;
  await putUser(store, user);
  return {
    ok: true,
    turnPrefer: Boolean(user.turnPrefer),
    turnHosted: userTurnHosted(user),
  };
}

/** Debit for minting TURN credentials (MVP proxy until usage metering). */
export async function debitTurnCredentials(
  store: EnvStore,
  userId: string,
  sessionId?: string
): Promise<
  | { ok: true; balance: number }
  | { ok: false; error: string }
> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.disabled) return { ok: false, error: "user_disabled" };
  if (!userTurnHosted(user)) return { ok: false, error: "turn_not_entitled" };
  if (!userTurnPrefer(user)) return { ok: false, error: "turn_not_preferred" };
  const balance = userCredits(user);
  if (balance < 1) return { ok: false, error: "credits_insufficient" };
  const next = balance - 1;
  user.credits = next;
  await putUser(store, user);
  const entry: CreditLedgerEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    delta: -1,
    balanceAfter: next,
    reason: "turn_credentials",
    sessionId,
  };
  const ledger = await readLedger(store, userId);
  ledger.unshift(entry);
  await writeLedger(store, userId, ledger);
  return { ok: true, balance: next };
}

export async function listCreditSessions(
  store: EnvStore,
  userId: string
): Promise<
  { at: number; delta: number; reason: string; sessionId?: string }[]
> {
  const ledger = await readLedger(store, userId);
  return ledger
    .filter((e) => e.delta < 0)
    .map((e) => ({
      at: e.at,
      delta: e.delta,
      reason: e.reason,
      sessionId: e.sessionId,
    }));
}
