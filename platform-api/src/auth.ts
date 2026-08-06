import { apiKeyPlaintext, keyPrefix, sha256Hex } from "./ids.js";

export type StoredApiKey = {
  userId: string;
  role: "admin" | "user";
  hash: string;
  prefix: string;
  createdAt: number;
};

export type EnvStore = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

const BOOTSTRAP_FLAG = "meta:bootstrap_done";
const KEY_BY_USER = (userId: string) => `key:user:${userId}`;
const KEY_BY_PREFIX = (prefix: string) => `key:prefix:${prefix}`;
const SHORT_TO_INVITE = (shortId: string) => `short:${shortId}`;

export async function isBootstrapped(store: EnvStore): Promise<boolean> {
  return (await store.get(BOOTSTRAP_FLAG)) === "1";
}

export async function markBootstrapped(store: EnvStore): Promise<void> {
  await store.put(BOOTSTRAP_FLAG, "1");
}

export async function getApiKeyForUser(
  store: EnvStore,
  userId: string
): Promise<StoredApiKey | null> {
  const raw = await store.get(KEY_BY_USER(userId));
  if (!raw) return null;
  return JSON.parse(raw) as StoredApiKey;
}

export async function putApiKey(
  store: EnvStore,
  plaintext: string,
  userId: string,
  role: "admin" | "user"
): Promise<StoredApiKey> {
  const existing = await store.get(KEY_BY_USER(userId));
  if (existing) {
    const prev = JSON.parse(existing) as StoredApiKey;
    await store.delete(KEY_BY_PREFIX(prev.prefix));
  }
  const hash = await sha256Hex(plaintext);
  const prefix = keyPrefix(plaintext);
  const record: StoredApiKey = {
    userId,
    role,
    hash,
    prefix,
    createdAt: Date.now(),
  };
  await store.put(KEY_BY_USER(userId), JSON.stringify(record));
  await store.put(KEY_BY_PREFIX(prefix), JSON.stringify(record));
  return record;
}

/** Revoke the account's only API key (hard cap remains 1). */
export async function deleteApiKey(
  store: EnvStore,
  userId: string
): Promise<boolean> {
  const existing = await store.get(KEY_BY_USER(userId));
  if (!existing) return false;
  const prev = JSON.parse(existing) as StoredApiKey;
  await store.delete(KEY_BY_PREFIX(prev.prefix));
  await store.delete(KEY_BY_USER(userId));
  return true;
}

const REG_INVITE = (token: string) => `reginv:${token}`;

export type RegistrationInvite = {
  token: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
};

export async function putRegistrationInvite(
  store: EnvStore,
  invite: RegistrationInvite
): Promise<void> {
  await store.put(REG_INVITE(invite.token), JSON.stringify(invite));
}

export async function getRegistrationInvite(
  store: EnvStore,
  token: string
): Promise<RegistrationInvite | null> {
  const raw = await store.get(REG_INVITE(token));
  if (!raw) return null;
  return JSON.parse(raw) as RegistrationInvite;
}

/** Invite-only registration without Social SSO (Phase 3 MVP claim). */
export async function claimRegistrationInvite(
  store: EnvStore,
  token: string,
  role: "user" | "admin" = "user"
): Promise<
  | { ok: true; userId: string; role: "user" | "admin"; apiKey: string }
  | { ok: false; error: string; status: number }
> {
  const inv = await getRegistrationInvite(store, token);
  if (!inv) return { ok: false, error: "not_found", status: 404 };
  if (Date.now() >= inv.expiresAt) {
    return { ok: false, error: "gone", status: 410 };
  }
  if (inv.usedAt) return { ok: false, error: "already_used", status: 410 };
  const userId = `user_${token.slice(0, 12)}`;
  const apiKey = apiKeyPlaintext();
  await putApiKey(store, apiKey, userId, role);
  inv.usedAt = Date.now();
  await putRegistrationInvite(store, inv);
  return { ok: true, userId, role, apiKey };
}

export async function lookupApiKey(
  store: EnvStore,
  bearer: string
): Promise<StoredApiKey | null> {
  if (!bearer.startsWith("pg_sk_")) return null;
  const prefix = keyPrefix(bearer);
  const raw = await store.get(KEY_BY_PREFIX(prefix));
  if (!raw) return null;
  const record = JSON.parse(raw) as StoredApiKey;
  const hash = await sha256Hex(bearer);
  if (hash !== record.hash) return null;
  return record;
}

export async function putShortMapping(
  store: EnvStore,
  shortId: string,
  inviteId: string,
  secret: string,
  targetField: string,
  expiresAt: number
): Promise<void> {
  await store.put(
    SHORT_TO_INVITE(shortId),
    JSON.stringify({ inviteId, secret, targetField, expiresAt })
  );
}

export async function getShortMapping(
  store: EnvStore,
  shortId: string
): Promise<{
  inviteId: string;
  secret: string;
  targetField: string;
  expiresAt: number;
  revoked?: boolean;
} | null> {
  const raw = await store.get(SHORT_TO_INVITE(shortId));
  if (!raw) return null;
  return JSON.parse(raw) as {
    inviteId: string;
    secret: string;
    targetField: string;
    expiresAt: number;
    revoked?: boolean;
  };
}

export async function markShortRevoked(
  store: EnvStore,
  shortId: string
): Promise<void> {
  const map = await getShortMapping(store, shortId);
  if (!map) return;
  await store.put(
    SHORT_TO_INVITE(shortId),
    JSON.stringify({ ...map, revoked: true, expiresAt: 0 })
  );
}

export async function deleteSecretMapping(
  store: EnvStore,
  secret: string
): Promise<void> {
  await store.delete(`secret:${secret}`);
}

export function parseBearer(req: Request): string | null {
  const h = req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}
