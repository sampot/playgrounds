/**
 * WebAuthn platform + PRF helpers for SecretStore unlock (DEC-029 Phase 1b).
 * Without PRF support we do not offer biometric unlock (password remains recovery).
 */

import {
  bytesToBase64,
  base64ToBytes,
  deriveWrappingKeyFromPrf,
  generateSalt,
  zeroize,
} from "./secretStoreCrypto";

const PRF_INFO = "playgrounds-secretstore-webauthn-v1";

export type WebAuthnPrfAvailability =
  { available: true } | { available: false; reason: string };

function isSecureContextOk(): boolean {
  const g = globalThis as { isSecureContext?: boolean; window?: Window };
  if (typeof g.isSecureContext === "boolean") return g.isSecureContext;
  if (typeof g.window !== "undefined" && g.window?.isSecureContext) return true;
  return false;
}

/** Feature-detect platform UV + PRF (hide UI when false). */
export async function probeWebAuthnPrfAvailability(): Promise<WebAuthnPrfAvailability> {
  if (!isSecureContextOk()) {
    return { available: false, reason: "需要安全內容（HTTPS 或 localhost）" };
  }
  if (typeof PublicKeyCredential === "undefined") {
    return { available: false, reason: "此瀏覽器不支援 WebAuthn" };
  }
  try {
    if (
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
      "function"
    ) {
      const uvpa =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!uvpa) {
        return {
          available: false,
          reason:
            "沒有可用的裝置生物識別（Face ID／Touch ID／Windows Hello 等）",
        };
      }
    }
  } catch {
    return { available: false, reason: "無法偵測平台驗證器" };
  }

  const getCaps = (
    PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    }
  ).getClientCapabilities;
  if (typeof getCaps === "function") {
    try {
      const caps = await getCaps.call(PublicKeyCredential);
      const prf =
        caps["extension:prf"] === true ||
        caps.extensionPrf === true ||
        caps.prf === true;
      if (!prf) {
        return {
          available: false,
          reason: "此瀏覽器／驗證器不支援 WebAuthn PRF（無法安全解鎖密鑰庫）",
        };
      }
    } catch {
      /* optimistic — verify at register */
    }
  }
  return { available: true };
}

function rpId(): string {
  try {
    const host = globalThis.location?.hostname;
    if (host) return host;
  } catch {
    /* */
  }
  return "localhost";
}

function randomChallenge(byteLength = 32): Uint8Array {
  const c = new Uint8Array(byteLength);
  crypto.getRandomValues(c);
  return c;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export interface WebAuthnPrfRegistration {
  credentialIdB64: string;
  prfSaltB64: string;
  prfOutput: Uint8Array;
}

/**
 * Create a platform credential with PRF and return one PRF evaluation
 * (used to wrap the SecretStore master key).
 */
export async function createWebAuthnPrfCredential(): Promise<WebAuthnPrfRegistration> {
  if (!navigator.credentials?.create) {
    throw new Error("secret_webauthn_unavailable");
  }
  const prfSalt = await generateSalt(32);
  const userId = await generateSalt(16);
  const challenge = randomChallenge();

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge: toArrayBuffer(challenge),
        rp: { id: rpId(), name: "Playgrounds 密鑰庫" },
        user: {
          id: toArrayBuffer(userId),
          name: "playgrounds-secretstore",
          displayName: "密鑰庫",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
          requireResidentKey: false,
        },
        timeout: 120_000,
        extensions: {
          prf: {
            eval: { first: toArrayBuffer(prfSalt) },
          },
        },
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") throw new Error("secret_auth_failed");
    throw new Error("secret_webauthn_unavailable");
  }

  if (!credential) throw new Error("secret_webauthn_unavailable");

  const ext = credential.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
  };
  if (!ext.prf?.enabled && !ext.prf?.results?.first) {
    throw new Error("secret_webauthn_unavailable");
  }

  let prfOutput: Uint8Array | null = ext.prf?.results?.first
    ? new Uint8Array(ext.prf.results.first)
    : null;

  if (!prfOutput) {
    // Some authenticators enable PRF on create but only evaluate on get.
    prfOutput = await evaluatePrfOnCredential(credential.rawId, prfSalt);
  }

  try {
    return {
      credentialIdB64: bytesToBase64(new Uint8Array(credential.rawId)),
      prfSaltB64: bytesToBase64(prfSalt),
      prfOutput,
    };
  } finally {
    zeroize(userId);
  }
}

async function evaluatePrfOnCredential(
  credentialId: ArrayBuffer,
  prfSalt: Uint8Array
): Promise<Uint8Array> {
  if (!navigator.credentials?.get) {
    throw new Error("secret_webauthn_unavailable");
  }
  const challenge = randomChallenge();
  let assertion: PublicKeyCredential | null = null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toArrayBuffer(challenge),
        rpId: rpId(),
        allowCredentials: [
          {
            type: "public-key",
            id: credentialId,
            transports: ["internal"],
          },
        ],
        userVerification: "required",
        timeout: 120_000,
        extensions: {
          prf: {
            eval: { first: toArrayBuffer(prfSalt) },
          },
        },
      },
    })) as PublicKeyCredential | null;
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError") throw new Error("secret_auth_failed");
    throw new Error("secret_webauthn_unavailable");
  }
  const ext = assertion?.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } };
  };
  const first = ext?.prf?.results?.first;
  if (!first) throw new Error("secret_webauthn_unavailable");
  return new Uint8Array(first);
}

/** Assert + PRF eval for an already-registered credential. */
export async function evaluateWebAuthnPrf(options: {
  credentialIdB64: string;
  prfSaltB64: string;
}): Promise<Uint8Array> {
  const credentialId = base64ToBytes(options.credentialIdB64);
  const prfSalt = base64ToBytes(options.prfSaltB64);
  return evaluatePrfOnCredential(toArrayBuffer(credentialId), prfSalt);
}

export async function wrappingKeyFromPrfOutput(
  prfOutput: Uint8Array
): Promise<CryptoKey> {
  return deriveWrappingKeyFromPrf(prfOutput, PRF_INFO);
}
