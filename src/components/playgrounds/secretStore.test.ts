import { beforeEach, describe, expect, it } from "vitest";
import {
  createSecretBindingsForEnv,
  deleteSecret,
  destroySecretStore,
  exportUnlockedSecretMaterial,
  getSecretPlaintext,
  getSecretStoreStatus,
  initializeSecretStore,
  listSecretMetas,
  lockSecretStore,
  resetSecretStoreForTests,
  setSecret,
  unlockSecretStore,
} from "./secretStore";
import { assertValidSecretName } from "./secretStoreCrypto";
import { createFunctionsEnv } from "./functionsEnv";

describe("secretStoreCrypto names", () => {
  it("rejects reserved and invalid names", () => {
    expect(() => assertValidSecretName("KV")).toThrow(/保留/);
    expect(() => assertValidSecretName("DB")).toThrow(/保留/);
    expect(() => assertValidSecretName("HOST")).toThrow(/保留/);
    expect(() => assertValidSecretName("DELEGATE")).toThrow(/保留/);
    expect(() => assertValidSecretName("COMPUTE")).toThrow(/保留/);
    expect(() => assertValidSecretName("vars")).toThrow(/保留/);
    expect(() => assertValidSecretName("secrets")).toThrow(/保留/);
    expect(() => assertValidSecretName("bad-name")).toThrow();
    expect(assertValidSecretName("OPENAI_API_KEY")).toBe("OPENAI_API_KEY");
  });
});

describe("secretStore", () => {
  beforeEach(async () => {
    await resetSecretStoreForTests();
  });

  it("initialize / unlock / lock / get", async () => {
    expect(await getSecretStoreStatus()).toEqual({ state: "absent" });
    await initializeSecretStore("test-password-123");
    expect(await getSecretStoreStatus()).toMatchObject({
      state: "unlocked",
      secretCount: 0,
      webauthnRegistered: false,
    });
    await setSecret("OPENAI_API_KEY", "sk-test");
    expect(await getSecretPlaintext("OPENAI_API_KEY")).toBe("sk-test");
    lockSecretStore();
    expect(await getSecretStoreStatus()).toMatchObject({
      state: "locked",
      secretCount: 1,
      webauthnRegistered: false,
    });
    await expect(getSecretPlaintext("OPENAI_API_KEY")).rejects.toThrow(
      /secret_locked/
    );
    await unlockSecretStore("test-password-123");
    expect(await getSecretPlaintext("OPENAI_API_KEY")).toBe("sk-test");
  });

  it("rejects wrong password", async () => {
    await initializeSecretStore("correct-horse");
    lockSecretStore();
    await expect(unlockSecretStore("wrong")).rejects.toThrow(
      /secret_auth_failed/
    );
  });

  it("list metas without values; delete", async () => {
    await initializeSecretStore("pw");
    await setSecret("A", "1");
    await setSecret("B", "2");
    const metas = await listSecretMetas();
    expect(metas.map(m => m.name)).toEqual(["A", "B"]);
    expect(JSON.stringify(metas)).not.toContain('"1"');
    await deleteSecret("A");
    expect((await listSecretMetas()).map(m => m.name)).toEqual(["B"]);
  });

  it("caches plaintext while unlocked and clears on lock", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    expect(exportUnlockedSecretMaterial()).toEqual({ TOKEN: "abc" });
    expect(await getSecretPlaintext("TOKEN")).toBe("abc");
    expect(await getSecretPlaintext("TOKEN")).toBe("abc");
    lockSecretStore();
    expect(exportUnlockedSecretMaterial()).toEqual({});
  });

  it("createSecretBindingsForEnv only when unlocked", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    const bindings = createSecretBindingsForEnv();
    expect(await bindings.TOKEN!.get()).toBe("abc");
    lockSecretStore();
    expect(createSecretBindingsForEnv()).toEqual({});
  });

  it("destroy clears store", async () => {
    await initializeSecretStore("pw");
    await setSecret("X", "y");
    await destroySecretStore();
    expect(await getSecretStoreStatus()).toEqual({ state: "absent" });
  });
});

describe("createFunctionsEnv secret bindings", () => {
  beforeEach(async () => {
    await resetSecretStoreForTests();
  });

  it("injects per-name bindings under env.secrets when unlocked", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    const env = createFunctionsEnv("work-1");
    expect(env.SECRETS).toBeUndefined();
    expect(env.TOKEN).toBeUndefined();
    const secrets = env.secrets as Record<
      string,
      { get: () => Promise<string> }
    >;
    expect(await secrets.TOKEN!.get()).toBe("abc");
  });

  it("omits secret entries when locked", async () => {
    await initializeSecretStore("pw");
    await setSecret("TOKEN", "abc");
    lockSecretStore();
    const env = createFunctionsEnv("work-1");
    expect(env.TOKEN).toBeUndefined();
    expect(env.secrets).toEqual({});
  });
});
