import {
  ACCESS_TOKEN_TTL_MS,
  accessTokenPlaintext,
  apiKeyPlaintext,
  keyPrefix,
  PROVISION_TTL_MS,
  provisionTokenPlaintext,
  sha256Hex,
} from "./ids.js";

export type StoredApiKey = {
  userId: string;
  role: "admin" | "user";
  hash: string;
  prefix: string;
  createdAt: number;
};

export type StoredAccessToken = {
  userId: string;
  role: "admin" | "user";
  hash: string;
  createdAt: number;
  expiresAt: number;
};

export type EnvStore = {
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list?(options: {
    prefix: string;
  }): Promise<{ keys: { name: string }[] }>;
};

const BOOTSTRAP_FLAG = "meta:bootstrap_done";
const USER_INDEX = "meta:user_ids";
const KEY_BY_USER = (userId: string) => `key:user:${userId}`;
const KEY_BY_PREFIX = (prefix: string) => `key:prefix:${prefix}`;
const AT_BY_HASH = (hash: string) => `at:hash:${hash}`;
const AT_BY_USER = (userId: string) => `at:user:${userId}`;
const USER_REC = (userId: string) => `user:${userId}`;
const SSO_GITHUB = (subject: string) => `sso:github:${subject}`;
const SSO_GOOGLE = (subject: string) => `sso:google:${subject}`;
const SHORT_TO_INVITE = (shortId: string) => `short:${shortId}`;
const PROVISION_BY_HASH = (hash: string) => `prov:hash:${hash}`;
const PROVISION_BY_USER = (userId: string) => `prov:user:${userId}`;

export type PlatformUser = {
  userId: string;
  role: "admin" | "user";
  createdAt: number;
  disabled?: boolean;
  /** Canonical origin e.g. https://play.samkuo.me */
  defaultFieldUrl?: string;
  github?: { id: string; login: string; linkedAt: number; avatarUrl?: string };
  google?: { id: string; email: string; linkedAt: number; avatarUrl?: string };
  /** Point balance (PG-PLATFORM-CREDITS-PLAN). */
  credits?: number;
  /** Admin: may use official TURN when credits allow. */
  turnHosted?: boolean;
  /** User preference: actually use connection relay when entitled. */
  turnPrefer?: boolean;
};

export async function getUser(
  store: EnvStore,
  userId: string
): Promise<PlatformUser | null> {
  const raw = await store.get(USER_REC(userId));
  if (!raw) return null;
  return JSON.parse(raw) as PlatformUser;
}

export async function putUser(
  store: EnvStore,
  user: PlatformUser
): Promise<void> {
  await store.put(USER_REC(user.userId), JSON.stringify(user));
}

async function readUserIndex(store: EnvStore): Promise<string[]> {
  const raw = await store.get(USER_INDEX);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function writeUserIndex(store: EnvStore, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].sort();
  await store.put(USER_INDEX, JSON.stringify(unique));
}

export async function addUserToIndex(
  store: EnvStore,
  userId: string
): Promise<void> {
  const ids = await readUserIndex(store);
  if (ids.includes(userId)) return;
  ids.push(userId);
  await writeUserIndex(store, ids);
}

export async function removeUserFromIndex(
  store: EnvStore,
  userId: string
): Promise<void> {
  const ids = await readUserIndex(store);
  const next = ids.filter((id) => id !== userId);
  if (next.length === ids.length) return;
  await writeUserIndex(store, next);
}

/** Rebuild index from KV list when missing (legacy rows). */
async function ensureUserIndex(store: EnvStore): Promise<string[]> {
  let ids = await readUserIndex(store);
  if (ids.length > 0) return ids;
  if (!store.list) return ids;
  const listed = await store.list({ prefix: "user:" });
  ids = listed.keys
    .map((k) => k.name.slice("user:".length))
    .filter((id) => id.length > 0 && !id.includes(":"));
  if (ids.length > 0) await writeUserIndex(store, ids);
  return ids;
}

export async function listUsers(store: EnvStore): Promise<PlatformUser[]> {
  const ids = await ensureUserIndex(store);
  const users: PlatformUser[] = [];
  for (const id of ids) {
    const u = await getUser(store, id);
    if (u) users.push(u);
  }
  users.sort((a, b) => b.createdAt - a.createdAt);
  return users;
}

export async function countActiveAdmins(store: EnvStore): Promise<number> {
  const users = await listUsers(store);
  return users.filter((u) => u.role === "admin" && !u.disabled).length;
}

export async function ensureUser(
  store: EnvStore,
  userId: string,
  role: "admin" | "user"
): Promise<PlatformUser> {
  const existing = await getUser(store, userId);
  if (existing) {
    await addUserToIndex(store, userId);
    return existing;
  }
  const user: PlatformUser = {
    userId,
    role,
    createdAt: Date.now(),
  };
  await putUser(store, user);
  await addUserToIndex(store, userId);
  return user;
}

export async function setUserDisabled(
  store: EnvStore,
  userId: string,
  disabled: boolean,
  actorUserId: string
): Promise<{ ok: true; user: PlatformUser } | { ok: false; error: string }> {
  if (userId === actorUserId) {
    return { ok: false, error: "cannot_disable_self" };
  }
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (disabled && user.role === "admin" && !user.disabled) {
    if ((await countActiveAdmins(store)) <= 1) {
      return { ok: false, error: "last_admin" };
    }
  }
  if (disabled) user.disabled = true;
  else delete user.disabled;
  await putUser(store, user);
  return { ok: true, user };
}

export function ssoLinkCount(user: PlatformUser): number {
  return (user.github ? 1 : 0) + (user.google ? 1 : 0);
}

export async function getUserIdByGithub(
  store: EnvStore,
  githubId: string
): Promise<string | null> {
  return store.get(SSO_GITHUB(githubId));
}

export async function linkGithub(
  store: EnvStore,
  userId: string,
  profile: { id: string; login: string; avatarUrl?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getUserIdByGithub(store, profile.id);
  if (existing && existing !== userId) {
    return { ok: false, error: "github_already_linked" };
  }
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.github && user.github.id !== profile.id) {
    await store.delete(SSO_GITHUB(user.github.id));
  }
  user.github = {
    id: profile.id,
    login: profile.login,
    linkedAt: Date.now(),
    avatarUrl: profile.avatarUrl ?? undefined,
  };
  await putUser(store, user);
  await store.put(SSO_GITHUB(profile.id), userId);
  return { ok: true };
}

export async function getUserIdByGoogle(
  store: EnvStore,
  googleId: string
): Promise<string | null> {
  return store.get(SSO_GOOGLE(googleId));
}

export async function linkGoogle(
  store: EnvStore,
  userId: string,
  profile: { id: string; email: string; avatarUrl?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const existing = await getUserIdByGoogle(store, profile.id);
  if (existing && existing !== userId) {
    return { ok: false, error: "google_already_linked" };
  }
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.google && user.google.id !== profile.id) {
    await store.delete(SSO_GOOGLE(user.google.id));
  }
  user.google = {
    id: profile.id,
    email: profile.email,
    linkedAt: Date.now(),
    avatarUrl: profile.avatarUrl ?? undefined,
  };
  await putUser(store, user);
  await store.put(SSO_GOOGLE(profile.id), userId);
  return { ok: true };
}

export async function unlinkGithub(
  store: EnvStore,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (!user.github) return { ok: false, error: "not_linked" };
  if (ssoLinkCount(user) <= 1) return { ok: false, error: "last_sso" };
  await store.delete(SSO_GITHUB(user.github.id));
  delete user.github;
  await putUser(store, user);
  return { ok: true };
}

export async function unlinkGoogle(
  store: EnvStore,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (!user.google) return { ok: false, error: "not_linked" };
  if (ssoLinkCount(user) <= 1) return { ok: false, error: "last_sso" };
  await store.delete(SSO_GOOGLE(user.google.id));
  delete user.google;
  await putUser(store, user);
  return { ok: true };
}

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
  await invalidateUserProvision(store, userId);
  const existing = await store.get(KEY_BY_USER(userId));
  if (!existing) return false;
  const prev = JSON.parse(existing) as StoredApiKey;
  await store.delete(KEY_BY_PREFIX(prev.prefix));
  await store.delete(KEY_BY_USER(userId));
  return true;
}

async function readAtUserIndex(store: EnvStore, userId: string): Promise<string[]> {
  const raw = await store.get(AT_BY_USER(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function addAtToUserIndex(
  store: EnvStore,
  userId: string,
  hash: string
): Promise<void> {
  const hashes = await readAtUserIndex(store, userId);
  if (!hashes.includes(hash)) hashes.push(hash);
  await store.put(AT_BY_USER(userId), JSON.stringify(hashes));
}

async function removeAtFromUserIndex(
  store: EnvStore,
  userId: string,
  hash: string
): Promise<void> {
  const hashes = await readAtUserIndex(store, userId);
  const next = hashes.filter((h) => h !== hash);
  if (next.length === 0) await store.delete(AT_BY_USER(userId));
  else await store.put(AT_BY_USER(userId), JSON.stringify(next));
}

export async function issueAccessToken(
  store: EnvStore,
  userId: string,
  role: "admin" | "user",
  ttlMs: number = ACCESS_TOKEN_TTL_MS
): Promise<{ plaintext: string; record: StoredAccessToken }> {
  const plaintext = accessTokenPlaintext();
  const hash = await sha256Hex(plaintext);
  const createdAt = Date.now();
  const record: StoredAccessToken = {
    userId,
    role,
    hash,
    createdAt,
    expiresAt: createdAt + ttlMs,
  };
  await store.put(AT_BY_HASH(hash), JSON.stringify(record));
  await addAtToUserIndex(store, userId, hash);
  return { plaintext, record };
}

export async function lookupAccessToken(
  store: EnvStore,
  bearer: string
): Promise<StoredAccessToken | null> {
  if (!bearer.startsWith("pg_at_")) return null;
  const hash = await sha256Hex(bearer);
  const raw = await store.get(AT_BY_HASH(hash));
  if (!raw) return null;
  const record = JSON.parse(raw) as StoredAccessToken;
  if (Date.now() >= record.expiresAt) {
    await store.delete(AT_BY_HASH(hash));
    await removeAtFromUserIndex(store, record.userId, hash);
    return null;
  }
  return record;
}

export async function revokeAccessToken(
  store: EnvStore,
  bearer: string
): Promise<boolean> {
  if (!bearer.startsWith("pg_at_")) return false;
  const hash = await sha256Hex(bearer);
  const raw = await store.get(AT_BY_HASH(hash));
  if (!raw) return false;
  const record = JSON.parse(raw) as StoredAccessToken;
  await store.delete(AT_BY_HASH(hash));
  await removeAtFromUserIndex(store, record.userId, hash);
  return true;
}

export async function revokeAllAccessTokensForUser(
  store: EnvStore,
  userId: string
): Promise<void> {
  const hashes = await readAtUserIndex(store, userId);
  for (const hash of hashes) {
    await store.delete(AT_BY_HASH(hash));
  }
  await store.delete(AT_BY_USER(userId));
}

/** Delete own account (or purge). Blocks last active admin. */
export async function deleteUserAccount(
  store: EnvStore,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser(store, userId);
  if (!user) return { ok: false, error: "user_not_found" };
  if (user.role === "admin" && !user.disabled) {
    if ((await countActiveAdmins(store)) <= 1) {
      return { ok: false, error: "last_admin" };
    }
  }
  if (user.github) await store.delete(SSO_GITHUB(user.github.id));
  if (user.google) await store.delete(SSO_GOOGLE(user.google.id));
  await invalidateUserProvision(store, userId);
  await deleteApiKey(store, userId);
  await revokeAllAccessTokensForUser(store, userId);
  await store.delete(USER_REC(userId));
  await removeUserFromIndex(store, userId);
  return { ok: true };
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

/** Invite-only registration: create account + access token; no field API key. */
export async function claimRegistrationInvite(
  store: EnvStore,
  token: string,
  role: "user" | "admin" = "user"
): Promise<
  | {
      ok: true;
      userId: string;
      role: "user" | "admin";
      accessToken: string;
      accessTokenExpiresAt: number;
    }
  | { ok: false; error: string; status: number }
> {
  const inv = await getRegistrationInvite(store, token);
  if (!inv) return { ok: false, error: "not_found", status: 404 };
  if (Date.now() >= inv.expiresAt) {
    return { ok: false, error: "gone", status: 410 };
  }
  if (inv.usedAt) return { ok: false, error: "already_used", status: 410 };
  const userId = `user_${token.slice(0, 12)}`;
  await ensureUser(store, userId, role);
  const at = await issueAccessToken(store, userId, role);
  inv.usedAt = Date.now();
  await putRegistrationInvite(store, inv);
  return {
    ok: true,
    userId,
    role,
    accessToken: at.plaintext,
    accessTokenExpiresAt: at.record.expiresAt,
  };
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

export type StoredProvision = {
  userId: string;
  hash: string;
  /** Plaintext API key held until single redeem or expiry. */
  apiKey: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
};

async function deleteProvisionRecord(
  store: EnvStore,
  userId: string,
  hash: string
): Promise<void> {
  await store.delete(PROVISION_BY_HASH(hash));
  const cur = await store.get(PROVISION_BY_USER(userId));
  if (cur === hash) await store.delete(PROVISION_BY_USER(userId));
}

/** Invalidate any outstanding provision for this user (e.g. before new one). */
export async function invalidateUserProvision(
  store: EnvStore,
  userId: string
): Promise<void> {
  const hash = await store.get(PROVISION_BY_USER(userId));
  if (!hash) return;
  await deleteProvisionRecord(store, userId, hash);
}

/**
 * Rotate field API key and issue a one-time provision token (plaintext returned once).
 */
export async function createFieldProvision(
  store: EnvStore,
  userId: string,
  role: "admin" | "user",
  ttlMs: number = PROVISION_TTL_MS
): Promise<{
  provisionToken: string;
  expiresAt: number;
  keyPrefix: string;
  keyCreatedAt: number;
}> {
  await invalidateUserProvision(store, userId);
  const apiKey = apiKeyPlaintext();
  const keyRec = await putApiKey(store, apiKey, userId, role);
  const provisionToken = provisionTokenPlaintext();
  const hash = await sha256Hex(provisionToken);
  const createdAt = Date.now();
  const expiresAt = createdAt + ttlMs;
  const record: StoredProvision = {
    userId,
    hash,
    apiKey,
    createdAt,
    expiresAt,
    usedAt: null,
  };
  await store.put(PROVISION_BY_HASH(hash), JSON.stringify(record));
  await store.put(PROVISION_BY_USER(userId), hash);
  return {
    provisionToken,
    expiresAt,
    keyPrefix: keyRec.prefix,
    keyCreatedAt: keyRec.createdAt,
  };
}

export async function redeemFieldProvision(
  store: EnvStore,
  token: string
): Promise<
  | { ok: true; apiKey: string; userId: string }
  | { ok: false; error: "invalid" | "expired" | "used" }
> {
  if (!token.startsWith("pg_pv_")) {
    return { ok: false, error: "invalid" };
  }
  const hash = await sha256Hex(token);
  const raw = await store.get(PROVISION_BY_HASH(hash));
  if (!raw) return { ok: false, error: "invalid" };
  const record = JSON.parse(raw) as StoredProvision;
  if (record.usedAt != null) return { ok: false, error: "used" };
  if (Date.now() > record.expiresAt) {
    await deleteProvisionRecord(store, record.userId, hash);
    return { ok: false, error: "expired" };
  }
  const user = await getUser(store, record.userId);
  if (!user || user.disabled) {
    await deleteProvisionRecord(store, record.userId, hash);
    return { ok: false, error: "invalid" };
  }
  await deleteProvisionRecord(store, record.userId, hash);
  return { ok: true, apiKey: record.apiKey, userId: record.userId };
}

export function parseBearer(req: Request): string | null {
  const h = req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m?.[1]?.trim() || null;
}
