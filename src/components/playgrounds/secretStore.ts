/**
 * Playgrounds SecretStore — playground-level encrypted secrets (DEC-029).
 * Unlock with password or WebAuthn PRF; page refresh = lock.
 * No plaintext long-lived map.
 */

import {
  clearSecretsMaterialOnRuntime,
  pushSecretsMaterialToRuntime,
} from "./secretStoreRuntimeBridge";
import {
  SECRET_STORE_KDF_ITERATIONS,
  SECRET_STORE_VERSION,
  assertValidSecretName,
  decryptUtf8,
  deriveWrappingKey,
  encryptUtf8,
  generateMasterKeyRaw,
  generateSalt,
  importMasterKey,
  unwrapMasterKeyRaw,
  wrapMasterKey,
  zeroize,
  bytesToBase64,
  base64ToBytes,
} from "./secretStoreCrypto";
import {
  createWebAuthnPrfCredential,
  evaluateWebAuthnPrf,
  wrappingKeyFromPrfOutput,
} from "./secretStoreWebAuthn";

export type SecretKind = "bearer" | "header" | "basic";

export interface SecretMeta {
  name: string;
  kind?: SecretKind;
  allowedHosts?: string[];
  defaultBaseUrl?: string;
  updatedAt: number;
}

export type SecretStoreStatus =
  | { state: "absent" }
  | {
      state: "locked";
      secretCount: number;
      webauthnRegistered: boolean;
    }
  | {
      state: "unlocked";
      secretCount: number;
      webauthnRegistered: boolean;
    };

interface PersistedSecretEntry extends SecretMeta {
  ivB64: string;
  ctB64: string;
}

interface PersistedWebAuthn {
  credentialIdB64: string;
  prfSaltB64: string;
  wrappedMaster: { ivB64: string; ctB64: string };
  registeredAt: number;
}

interface PersistedStore {
  version: typeof SECRET_STORE_VERSION;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    saltB64: string;
  };
  wrappedMaster: { ivB64: string; ctB64: string };
  webauthn?: PersistedWebAuthn;
  secrets: PersistedSecretEntry[];
}

const OPFS_ROOT = "playgrounds-secret-store";
const OPFS_FILE = "store-v1.json";
const LEGACY_SECRETS_ROOT = "playgrounds-secrets";

let persisted: PersistedStore | null = null;
let masterKey: CryptoKey | null = null;
/** Decrypted plaintext while unlocked (DEC-038 §6.3-A); cleared on lock. */
let plaintextCache: Map<string, string> | null = null;
let loaded = false;
/** In-memory fallback when OPFS unavailable (tests / odd envs). */
let memoryBlob: PersistedStore | null = null;

function isOpfsAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

async function readPersisted(): Promise<PersistedStore | null> {
  if (memoryBlob) return structuredClone(memoryBlob);
  if (!isOpfsAvailable()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(OPFS_ROOT, { create: false });
    const handle = await dir.getFileHandle(OPFS_FILE);
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as PersistedStore;
    if (parsed?.version !== SECRET_STORE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersisted(store: PersistedStore): Promise<void> {
  memoryBlob = structuredClone(store);
  if (!isOpfsAvailable()) return;
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(OPFS_ROOT, { create: true });
  const handle = await dir.getFileHandle(OPFS_FILE, { create: true });
  const writable = await handle.createWritable();
  await writable.write(JSON.stringify(store));
  await writable.close();
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  persisted = await readPersisted();
  loaded = true;
}

function webauthnRegisteredFlag(store: PersistedStore | null): boolean {
  return Boolean(
    store?.webauthn?.credentialIdB64 && store.webauthn.wrappedMaster
  );
}

export async function getSecretStoreStatus(): Promise<SecretStoreStatus> {
  await ensureLoaded();
  if (!persisted) return { state: "absent" };
  const secretCount = persisted.secrets.length;
  const webauthnRegistered = webauthnRegisteredFlag(persisted);
  if (masterKey) return { state: "unlocked", secretCount, webauthnRegistered };
  return { state: "locked", secretCount, webauthnRegistered };
}

export function isWebAuthnUnlockRegistered(): boolean {
  return webauthnRegisteredFlag(persisted);
}

export async function listSecretMetas(): Promise<SecretMeta[]> {
  await ensureLoaded();
  if (!persisted) return [];
  return persisted.secrets
    .map(({ name, kind, allowedHosts, defaultBaseUrl, updatedAt }) => ({
      name,
      kind,
      allowedHosts,
      defaultBaseUrl,
      updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function isSecretStoreUnlocked(): boolean {
  return masterKey !== null;
}

export async function initializeSecretStore(password: string): Promise<void> {
  await ensureLoaded();
  if (persisted) throw new Error("SecretStore 已存在；請先解鎖或銷毀");
  if (!password || !String(password).trim()) {
    throw new Error("請設定密碼");
  }
  const salt = await generateSalt();
  const wrapping = await deriveWrappingKey(password, salt);
  const masterRaw = await generateMasterKeyRaw();
  try {
    const wrappedMaster = await wrapMasterKey(wrapping, masterRaw);
    const key = await importMasterKey(masterRaw);
    const store: PersistedStore = {
      version: SECRET_STORE_VERSION,
      kdf: {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: SECRET_STORE_KDF_ITERATIONS,
        saltB64: bytesToBase64(salt),
      },
      wrappedMaster,
      secrets: [],
    };
    await writePersisted(store);
    persisted = store;
    masterKey = key;
    plaintextCache = new Map();
    await syncPlaintextToRuntime();
  } finally {
    zeroize(masterRaw);
  }
}

async function unwrapMasterRawWithPassword(
  password: string
): Promise<Uint8Array> {
  const store = requirePersisted();
  const salt = base64ToBytes(store.kdf.saltB64);
  const wrapping = await deriveWrappingKey(
    password,
    salt,
    store.kdf.iterations
  );
  return unwrapMasterKeyRaw(
    wrapping,
    store.wrappedMaster.ivB64,
    store.wrappedMaster.ctB64
  );
}

async function rebuildPlaintextCache(): Promise<void> {
  const mk = masterKey;
  const store = persisted;
  if (!mk || !store) {
    plaintextCache = null;
    return;
  }
  const next = new Map<string, string>();
  for (const entry of store.secrets) {
    next.set(
      entry.name,
      await decryptUtf8(mk, entry.ivB64, entry.ctB64, entry.name)
    );
  }
  plaintextCache = next;
}

async function syncPlaintextToRuntime(): Promise<void> {
  if (!plaintextCache) {
    await clearSecretsMaterialOnRuntime();
    return;
  }
  const material: Record<string, string> = {};
  for (const [k, v] of plaintextCache) material[k] = v;
  await pushSecretsMaterialToRuntime(material);
}

export async function unlockSecretStore(password: string): Promise<void> {
  await ensureLoaded();
  if (!persisted) throw new Error("secret_absent");
  if (masterKey) {
    if (!plaintextCache) await rebuildPlaintextCache();
    await syncPlaintextToRuntime();
    return;
  }
  const masterRaw = await unwrapMasterRawWithPassword(password);
  try {
    masterKey = await importMasterKey(masterRaw);
  } finally {
    zeroize(masterRaw);
  }
  await rebuildPlaintextCache();
  await syncPlaintextToRuntime();
}

/**
 * Register platform biometric unlock (PRF). Requires password to re-wrap master
 * (master CryptoKey is non-extractable). Replaces any prior WebAuthn registration.
 */
export async function registerWebAuthnUnlock(password: string): Promise<void> {
  await ensureLoaded();
  requirePersisted();
  if (!password || !String(password).trim()) {
    throw new Error("請輸入復原密碼以登錄生物識別");
  }
  const masterRaw = await unwrapMasterRawWithPassword(password);
  let prfOutput: Uint8Array | null = null;
  try {
    // Ensure password path still works; also unlock if locked.
    if (!masterKey) {
      masterKey = await importMasterKey(masterRaw);
      await rebuildPlaintextCache();
      await syncPlaintextToRuntime();
    }
    const reg = await createWebAuthnPrfCredential();
    prfOutput = reg.prfOutput;
    const wrapping = await wrappingKeyFromPrfOutput(prfOutput);
    const wrappedMaster = await wrapMasterKey(wrapping, masterRaw);
    const store = requirePersisted();
    store.webauthn = {
      credentialIdB64: reg.credentialIdB64,
      prfSaltB64: reg.prfSaltB64,
      wrappedMaster,
      registeredAt: Date.now(),
    };
    await writePersisted(store);
    persisted = store;
  } finally {
    zeroize(masterRaw);
    if (prfOutput) zeroize(prfOutput);
  }
}

export async function unregisterWebAuthnUnlock(): Promise<void> {
  requireUnlocked();
  const store = requirePersisted();
  delete store.webauthn;
  await writePersisted(store);
  persisted = store;
}

/** Unlock via registered WebAuthn PRF (no password). */
export async function unlockSecretStoreWithWebAuthn(): Promise<void> {
  await ensureLoaded();
  if (!persisted) throw new Error("secret_absent");
  if (masterKey) {
    if (!plaintextCache) await rebuildPlaintextCache();
    await syncPlaintextToRuntime();
    return;
  }
  const wa = persisted.webauthn;
  if (!wa?.credentialIdB64 || !wa.wrappedMaster) {
    throw new Error("secret_webauthn_unavailable");
  }
  let prfOutput: Uint8Array | null = null;
  try {
    prfOutput = await evaluateWebAuthnPrf({
      credentialIdB64: wa.credentialIdB64,
      prfSaltB64: wa.prfSaltB64,
    });
    const wrapping = await wrappingKeyFromPrfOutput(prfOutput);
    const masterRaw = await unwrapMasterKeyRaw(
      wrapping,
      wa.wrappedMaster.ivB64,
      wa.wrappedMaster.ctB64
    );
    try {
      masterKey = await importMasterKey(masterRaw);
    } finally {
      zeroize(masterRaw);
    }
  } finally {
    if (prfOutput) zeroize(prfOutput);
  }
  await rebuildPlaintextCache();
  await syncPlaintextToRuntime();
}

export function lockSecretStore(): void {
  masterKey = null;
  plaintextCache = null;
  void clearSecretsMaterialOnRuntime();
}

export async function destroySecretStore(): Promise<void> {
  lockSecretStore();
  persisted = null;
  memoryBlob = null;
  loaded = true;
  if (!isOpfsAvailable()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(OPFS_ROOT, { recursive: true });
  } catch {
    /* missing */
  }
}

function requireUnlocked(): CryptoKey {
  if (!masterKey) throw new Error("secret_locked");
  return masterKey;
}

function requirePersisted(): PersistedStore {
  if (!persisted) throw new Error("secret_absent");
  return persisted;
}

export async function setSecret(
  name: string,
  value: string,
  meta?: Partial<Pick<SecretMeta, "kind" | "allowedHosts" | "defaultBaseUrl">>
): Promise<void> {
  const key = assertValidSecretName(name);
  const mk = requireUnlocked();
  const store = requirePersisted();
  const enc = await encryptUtf8(mk, String(value ?? ""), key);
  const updatedAt = Date.now();
  const entry: PersistedSecretEntry = {
    name: key,
    kind: meta?.kind ?? "bearer",
    allowedHosts: meta?.allowedHosts ?? [],
    defaultBaseUrl: meta?.defaultBaseUrl,
    updatedAt,
    ivB64: enc.ivB64,
    ctB64: enc.ctB64,
  };
  const idx = store.secrets.findIndex(s => s.name === key);
  if (idx >= 0) store.secrets[idx] = entry;
  else store.secrets.push(entry);
  await writePersisted(store);
  persisted = store;
  if (!plaintextCache) plaintextCache = new Map();
  plaintextCache.set(key, String(value ?? ""));
  await syncPlaintextToRuntime();
}

export async function deleteSecret(name: string): Promise<void> {
  const key = assertValidSecretName(name);
  requireUnlocked();
  const store = requirePersisted();
  store.secrets = store.secrets.filter(s => s.name !== key);
  await writePersisted(store);
  persisted = store;
  plaintextCache?.delete(key);
  await syncPlaintextToRuntime();
}

/**
 * Return plaintext for a functions binding. Uses in-memory cache while unlocked
 * (DEC-038 §6.3-A). Caller must not log the value.
 */
export async function getSecretPlaintext(name: string): Promise<string> {
  const key = assertValidSecretName(name);
  requireUnlocked();
  const cached = plaintextCache?.get(key);
  if (cached !== undefined) return cached;
  const store = requirePersisted();
  const entry = store.secrets.find(s => s.name === key);
  if (!entry) throw new Error("secret_not_found");
  const mk = requireUnlocked();
  const value = await decryptUtf8(mk, entry.ivB64, entry.ctB64, key);
  if (!plaintextCache) plaintextCache = new Map();
  plaintextCache.set(key, value);
  return value;
}

export interface SecretBinding {
  get(): Promise<string>;
}

/** Build per-secret bindings for functions env (no bag). */
export function createSecretBindingsForEnv(): Record<string, SecretBinding> {
  if (!masterKey || !persisted) return {};
  const out: Record<string, SecretBinding> = {};
  for (const s of persisted.secrets) {
    const name = s.name;
    out[name] = {
      async get() {
        return getSecretPlaintext(name);
      },
    };
  }
  return out;
}

/** Snapshot of unlocked plaintext for Backend Runtime (empty when locked). */
export function exportUnlockedSecretMaterial(): Record<string, string> {
  if (!plaintextCache) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of plaintextCache) out[k] = v;
  return out;
}

/** Clear legacy per-project plaintext secrets tree (best-effort). */
export async function clearLegacyProjectSecretsRoot(): Promise<void> {
  if (!isOpfsAvailable()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(LEGACY_SECRETS_ROOT, { recursive: true });
  } catch {
    /* missing */
  }
}

/** Test helper — wipe in-memory + forget OPFS load flag. */
export async function resetSecretStoreForTests(): Promise<void> {
  lockSecretStore();
  persisted = null;
  memoryBlob = null;
  plaintextCache = null;
  loaded = false;
  if (isOpfsAvailable()) {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(OPFS_ROOT, { recursive: true });
    } catch {
      /* */
    }
  }
}
