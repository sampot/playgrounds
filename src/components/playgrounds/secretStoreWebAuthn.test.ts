import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWebAuthnPrfCredential,
  evaluateWebAuthnPrf,
  probeWebAuthnPrfAvailability,
  wrappingKeyFromPrfOutput,
} from "./secretStoreWebAuthn";
import {
  generateMasterKeyRaw,
  unwrapMasterKeyRaw,
  wrapMasterKey,
  zeroize,
} from "./secretStoreCrypto";
import {
  getSecretPlaintext,
  getSecretStoreStatus,
  initializeSecretStore,
  lockSecretStore,
  registerWebAuthnUnlock,
  resetSecretStoreForTests,
  setSecret,
  unlockSecretStore,
  unlockSecretStoreWithWebAuthn,
  unregisterWebAuthnUnlock,
} from "./secretStore";

const PRF_BYTES = new Uint8Array(32).fill(9);
const CRED_ID = new Uint8Array(16).fill(3);

function mockPublicKeyCredential(opts?: { prfOnCreate?: boolean }) {
  const prfOnCreate = opts?.prfOnCreate !== false;
  const createCalls: unknown[] = [];
  const getCalls: unknown[] = [];

  class MockPKC {
    rawId = CRED_ID.buffer.slice(0);
    getClientExtensionResults() {
      if (prfOnCreate) {
        return {
          prf: {
            enabled: true,
            results: { first: PRF_BYTES.buffer.slice(0) },
          },
        };
      }
      return { prf: { enabled: true } };
    }
    static async isUserVerifyingPlatformAuthenticatorAvailable() {
      return true;
    }
    static async getClientCapabilities() {
      return { "extension:prf": true };
    }
  }

  const create = async (...args: unknown[]) => {
    createCalls.push(args);
    return new MockPKC();
  };
  const get = async (...args: unknown[]) => {
    getCalls.push(args);
    return {
      getClientExtensionResults: () => ({
        prf: { results: { first: PRF_BYTES.buffer.slice(0) } },
      }),
    };
  };

  vi.stubGlobal("PublicKeyCredential", MockPKC);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("location", { hostname: "localhost" });
  vi.stubGlobal("navigator", { credentials: { create, get } });

  return {
    createCalls,
    getCalls,
    MockPKC,
  };
}

describe("secretStoreWebAuthn", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probe reports available when UVPA + PRF caps", async () => {
    mockPublicKeyCredential();
    await expect(probeWebAuthnPrfAvailability()).resolves.toEqual({
      available: true,
    });
  });

  it("probe hides when PRF capability false", async () => {
    const { MockPKC } = mockPublicKeyCredential();
    MockPKC.getClientCapabilities = async () => ({ "extension:prf": false });
    const r = await probeWebAuthnPrfAvailability();
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toMatch(/PRF/);
  });

  it("create + evaluate PRF can wrap/unwrap master", async () => {
    mockPublicKeyCredential();
    const reg = await createWebAuthnPrfCredential();
    expect(reg.credentialIdB64).toBeTruthy();
    const wrapping = await wrappingKeyFromPrfOutput(reg.prfOutput);
    const master = await generateMasterKeyRaw();
    try {
      const wrapped = await wrapMasterKey(wrapping, master);
      const again = await evaluateWebAuthnPrf({
        credentialIdB64: reg.credentialIdB64,
        prfSaltB64: reg.prfSaltB64,
      });
      const wrapping2 = await wrappingKeyFromPrfOutput(again);
      const raw = await unwrapMasterKeyRaw(
        wrapping2,
        wrapped.ivB64,
        wrapped.ctB64
      );
      try {
        expect([...raw]).toEqual([...master]);
      } finally {
        zeroize(raw);
      }
    } finally {
      zeroize(master);
      zeroize(reg.prfOutput);
    }
  });
});

describe("secretStore WebAuthn unlock", () => {
  beforeEach(async () => {
    await resetSecretStoreForTests();
    mockPublicKeyCredential();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("register / lock / unlock with WebAuthn; password still works", async () => {
    await initializeSecretStore("pw-recovery");
    await setSecret("TOKEN", "abc");
    await registerWebAuthnUnlock("pw-recovery");
    expect(await getSecretStoreStatus()).toMatchObject({
      state: "unlocked",
      webauthnRegistered: true,
    });
    lockSecretStore();
    await unlockSecretStoreWithWebAuthn();
    expect(await getSecretPlaintext("TOKEN")).toBe("abc");
    lockSecretStore();
    await unlockSecretStore("pw-recovery");
    expect(await getSecretPlaintext("TOKEN")).toBe("abc");
  });

  it("unregister clears biometric path", async () => {
    await initializeSecretStore("pw");
    await registerWebAuthnUnlock("pw");
    await unregisterWebAuthnUnlock();
    expect(await getSecretStoreStatus()).toMatchObject({
      webauthnRegistered: false,
    });
    lockSecretStore();
    await expect(unlockSecretStoreWithWebAuthn()).rejects.toThrow(
      /secret_webauthn_unavailable/
    );
  });

  it("falls back to get() when create only enables PRF", async () => {
    await resetSecretStoreForTests();
    const { getCalls } = mockPublicKeyCredential({ prfOnCreate: false });
    await initializeSecretStore("pw");
    await registerWebAuthnUnlock("pw");
    expect(getCalls.length).toBeGreaterThan(0);
    lockSecretStore();
    await unlockSecretStoreWithWebAuthn();
    expect(await getSecretStoreStatus()).toMatchObject({ state: "unlocked" });
  });
});
