/**
 * WebCrypto helpers for Playgrounds SecretStore (DEC-029).
 * Password → PBKDF2 → wrap/unwrap master key; AES-GCM for secret values.
 */

export const SECRET_STORE_KDF_ITERATIONS = 310_000;
export const SECRET_STORE_VERSION = 1 as const;

/** Top-level env reserved names (bindings + lowercase namespaces; DEC-035／036). */
const RESERVED_BINDING_NAMES = new Set([
  "KV",
  "DB",
  "D1", // legacy binding name
  "HOST",
  "TOOL",
  "DELEGATE",
  "SESSION",
  "COMPUTE",
  "vars",
  "secrets",
]);

export function isReservedSecretName(name: string): boolean {
  return RESERVED_BINDING_NAMES.has(name);
}

export function assertValidSecretName(name: string): string {
  const key = String(name || "").trim();
  if (!key) throw new Error("密鑰名稱不可為空");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    throw new Error("密鑰名稱須為識別字（字母／數字／底線）");
  }
  if (isReservedSecretName(key)) {
    throw new Error(`密鑰名稱不可使用保留字 ${key}`);
  }
  return key;
}

export function zeroize(buf: Uint8Array | null | undefined): void {
  if (buf) buf.fill(0);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Copy into a fresh ArrayBuffer-backed view for WebCrypto BufferSource typing. */
export function asBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("secret_crypto_unavailable");
  return subtle;
}

export async function generateSalt(byteLength = 16): Promise<Uint8Array> {
  const salt = new Uint8Array(byteLength);
  crypto.getRandomValues(salt);
  return salt;
}

/** HKDF → AES-GCM wrapping key from WebAuthn PRF output. */
export async function deriveWrappingKeyFromPrf(
  prfOutput: Uint8Array,
  info = "playgrounds-secretstore-webauthn-v1"
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const baseKey = await subtle.importKey(
    "raw",
    asBufferSource(prfOutput),
    "HKDF",
    false,
    ["deriveKey"]
  );
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function deriveWrappingKey(
  password: string,
  salt: Uint8Array,
  iterations = SECRET_STORE_KDF_ITERATIONS
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const enc = new TextEncoder();
  const passBytes = asBufferSource(enc.encode(password));
  try {
    const baseKey = await subtle.importKey("raw", passBytes, "PBKDF2", false, [
      "deriveKey",
    ]);
    return subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: asBufferSource(salt),
        iterations,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  } finally {
    zeroize(passBytes);
  }
}

export async function generateMasterKeyRaw(): Promise<Uint8Array> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return raw;
}

export async function importMasterKey(raw: Uint8Array): Promise<CryptoKey> {
  return requireSubtle().importKey(
    "raw",
    asBufferSource(raw),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapMasterKey(
  wrappingKey: CryptoKey,
  masterRaw: Uint8Array
): Promise<{ ivB64: string; ctB64: string }> {
  const subtle = requireSubtle();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    asBufferSource(masterRaw)
  );
  return {
    ivB64: bytesToBase64(iv),
    ctB64: bytesToBase64(new Uint8Array(ct)),
  };
}

export async function unwrapMasterKeyRaw(
  wrappingKey: CryptoKey,
  ivB64: string,
  ctB64: string
): Promise<Uint8Array> {
  const subtle = requireSubtle();
  const iv = asBufferSource(base64ToBytes(ivB64));
  const ct = asBufferSource(base64ToBytes(ctB64));
  try {
    const raw = await subtle.decrypt({ name: "AES-GCM", iv }, wrappingKey, ct);
    return new Uint8Array(raw);
  } catch {
    throw new Error("secret_auth_failed");
  }
}

export async function encryptUtf8(
  masterKey: CryptoKey,
  plaintext: string,
  aad?: string
): Promise<{ ivB64: string; ctB64: string }> {
  const subtle = requireSubtle();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const data = asBufferSource(new TextEncoder().encode(plaintext));
  try {
    const params: AesGcmParams = { name: "AES-GCM", iv };
    if (aad) params.additionalData = new TextEncoder().encode(aad);
    const ct = await subtle.encrypt(params, masterKey, data);
    return {
      ivB64: bytesToBase64(iv),
      ctB64: bytesToBase64(new Uint8Array(ct)),
    };
  } finally {
    zeroize(data);
  }
}

export async function decryptUtf8(
  masterKey: CryptoKey,
  ivB64: string,
  ctB64: string,
  aad?: string
): Promise<string> {
  const subtle = requireSubtle();
  const iv = asBufferSource(base64ToBytes(ivB64));
  const ct = asBufferSource(base64ToBytes(ctB64));
  const params: AesGcmParams = { name: "AES-GCM", iv };
  if (aad) params.additionalData = new TextEncoder().encode(aad);
  const pt = new Uint8Array(await subtle.decrypt(params, masterKey, ct));
  try {
    return new TextDecoder().decode(pt);
  } finally {
    zeroize(pt);
  }
}
