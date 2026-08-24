import { describe, expect, it } from "vitest";
import {
  listDeviceTokens,
  lookupDeviceToken,
  mintDeviceToken,
  revokeDeviceToken,
  touchDeviceTokenLastUsed,
} from "./boothDevices.js";
import type { EnvStore } from "./auth.js";

function memoryStore(): EnvStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
}

describe("boothDevices", () => {
  it("mints and looks up a device token by hash", async () => {
    const store = memoryStore();
    const { plaintext, record } = await mintDeviceToken(
      store,
      "user-1",
      "user",
      "home-server"
    );
    expect(plaintext.startsWith("pg_dt_")).toBe(true);
    expect(record.label).toBe("home-server");
    const found = await lookupDeviceToken(store, plaintext);
    expect(found?.userId).toBe("user-1");
    expect(found?.id).toBe(record.id);
  });

  it("lists public device metadata without secret", async () => {
    const store = memoryStore();
    const { record } = await mintDeviceToken(store, "user-1", "user", "a");
    const list = await listDeviceTokens(store, "user-1");
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: record.id,
      label: "a",
      prefix: record.prefix,
      createdAt: record.createdAt,
      lastUsedAt: null,
    });
  });

  it("revokes device token so lookup fails", async () => {
    const store = memoryStore();
    const { plaintext, record } = await mintDeviceToken(
      store,
      "user-1",
      "user",
      "a"
    );
    expect(await revokeDeviceToken(store, "user-1", record.id)).toBe(true);
    expect(await lookupDeviceToken(store, plaintext)).toBeNull();
    expect(await listDeviceTokens(store, "user-1")).toHaveLength(0);
  });

  it("rejects revoke for another user's device", async () => {
    const store = memoryStore();
    const { record } = await mintDeviceToken(store, "user-1", "user", "a");
    expect(await revokeDeviceToken(store, "user-2", record.id)).toBe(false);
  });

  it("updates lastUsedAt on touch", async () => {
    const store = memoryStore();
    const { plaintext, record } = await mintDeviceToken(
      store,
      "user-1",
      "user",
      "a"
    );
    await touchDeviceTokenLastUsed(store, record);
    const found = await lookupDeviceToken(store, plaintext);
    expect(found?.lastUsedAt).toBeTypeOf("number");
  });
});
