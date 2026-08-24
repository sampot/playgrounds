import {
  deviceTokenPlaintext,
  deviceTokenPrefix,
  randomId,
  sha256Hex,
} from "./ids.js";
import type { EnvStore } from "./auth.js";

export type StoredDeviceToken = {
  id: string;
  userId: string;
  role: "admin" | "user";
  hash: string;
  prefix: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
};

export type PublicDeviceToken = {
  id: string;
  label: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
};

const DEVICE_BY_HASH = (hash: string) => `booth:device:hash:${hash}`;
const DEVICE_BY_ID = (id: string) => `booth:device:id:${id}`;
const DEVICES_BY_USER = (userId: string) => `booth:devices:user:${userId}`;

async function readUserDeviceIds(
  store: EnvStore,
  userId: string
): Promise<string[]> {
  const raw = await store.get(DEVICES_BY_USER(userId));
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

async function getDeviceById(
  store: EnvStore,
  deviceId: string
): Promise<StoredDeviceToken | null> {
  const hash = await store.get(DEVICE_BY_ID(deviceId));
  if (!hash) return null;
  const raw = await store.get(DEVICE_BY_HASH(hash));
  if (!raw) return null;
  return JSON.parse(raw) as StoredDeviceToken;
}

export async function mintDeviceToken(
  store: EnvStore,
  userId: string,
  role: "admin" | "user",
  label: string
): Promise<{ plaintext: string; record: StoredDeviceToken }> {
  const plaintext = deviceTokenPlaintext();
  const hash = await sha256Hex(plaintext);
  const prefix = deviceTokenPrefix(plaintext);
  const id = randomId(12);
  const now = Date.now();
  const record: StoredDeviceToken = {
    id,
    userId,
    role,
    hash,
    prefix,
    label: label.trim() || "未命名裝置",
    createdAt: now,
    lastUsedAt: null,
  };
  await store.put(DEVICE_BY_HASH(hash), JSON.stringify(record));
  await store.put(DEVICE_BY_ID(id), hash);
  const ids = await readUserDeviceIds(store, userId);
  if (!ids.includes(id)) ids.push(id);
  await store.put(DEVICES_BY_USER(userId), JSON.stringify(ids));
  return { plaintext, record };
}

export async function lookupDeviceToken(
  store: EnvStore,
  bearer: string
): Promise<StoredDeviceToken | null> {
  if (!bearer.startsWith("pg_dt_")) return null;
  const hash = await sha256Hex(bearer);
  const raw = await store.get(DEVICE_BY_HASH(hash));
  if (!raw) return null;
  const record = JSON.parse(raw) as StoredDeviceToken;
  if (record.hash !== hash) return null;
  return record;
}

export async function listDeviceTokens(
  store: EnvStore,
  userId: string
): Promise<PublicDeviceToken[]> {
  const ids = await readUserDeviceIds(store, userId);
  const out: PublicDeviceToken[] = [];
  for (const id of ids) {
    const rec = await getDeviceById(store, id);
    if (!rec) continue;
    out.push({
      id: rec.id,
      label: rec.label,
      prefix: rec.prefix,
      createdAt: rec.createdAt,
      lastUsedAt: rec.lastUsedAt,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeDeviceToken(
  store: EnvStore,
  userId: string,
  deviceId: string
): Promise<boolean> {
  const rec = await getDeviceById(store, deviceId);
  if (!rec || rec.userId !== userId) return false;
  await store.delete(DEVICE_BY_HASH(rec.hash));
  await store.delete(DEVICE_BY_ID(deviceId));
  const ids = (await readUserDeviceIds(store, userId)).filter((i) => i !== deviceId);
  if (ids.length === 0) await store.delete(DEVICES_BY_USER(userId));
  else await store.put(DEVICES_BY_USER(userId), JSON.stringify(ids));
  return true;
}

export async function touchDeviceTokenLastUsed(
  store: EnvStore,
  record: StoredDeviceToken
): Promise<void> {
  const updated: StoredDeviceToken = { ...record, lastUsedAt: Date.now() };
  await store.put(DEVICE_BY_HASH(record.hash), JSON.stringify(updated));
}

export async function revokeAllDeviceTokensForUser(
  store: EnvStore,
  userId: string
): Promise<void> {
  const ids = await readUserDeviceIds(store, userId);
  for (const id of ids) {
    await revokeDeviceToken(store, userId, id);
  }
}
