import { describe, expect, it } from "vitest";
import {
  deleteUserAccount,
  ensureUser,
  getUser,
  issueAccessToken,
  linkGithub,
  linkGoogle,
  listUsers,
  lookupAccessToken,
  lookupApiKey,
  putApiKey,
  setUserDisabled,
  unlinkGithub,
  unlinkGoogle,
  type EnvStore,
} from "./auth.js";
import { apiKeyPlaintext } from "./ids.js";

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
    async list({ prefix }) {
      return {
        keys: [...data.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((name) => ({ name })),
      };
    },
  };
}

describe("account lifecycle", () => {
  it("lists users via index", async () => {
    const store = memoryStore();
    await ensureUser(store, "admin", "admin");
    await ensureUser(store, "user_a", "user");
    const users = await listUsers(store);
    expect(users.map((u) => u.userId).sort()).toEqual(["admin", "user_a"]);
  });

  it("disables and re-enables; blocks self and last admin", async () => {
    const store = memoryStore();
    await ensureUser(store, "admin", "admin");
    await ensureUser(store, "user_a", "user");

    const self = await setUserDisabled(store, "admin", true, "admin");
    expect(self).toEqual({ ok: false, error: "cannot_disable_self" });

    const last = await setUserDisabled(store, "admin", true, "user_a");
    expect(last).toEqual({ ok: false, error: "last_admin" });

    const ok = await setUserDisabled(store, "user_a", true, "admin");
    expect(ok.ok).toBe(true);
    expect((await getUser(store, "user_a"))?.disabled).toBe(true);

    const en = await setUserDisabled(store, "user_a", false, "admin");
    expect(en.ok).toBe(true);
    expect((await getUser(store, "user_a"))?.disabled).toBeUndefined();
  });

  it("unlinks SSO but keeps at least one", async () => {
    const store = memoryStore();
    await ensureUser(store, "u1", "user");
    await linkGithub(store, "u1", { id: "gh1", login: "alice" });

    const last = await unlinkGithub(store, "u1");
    expect(last).toEqual({ ok: false, error: "last_sso" });

    await linkGoogle(store, "u1", { id: "g1", email: "a@example.com" });
    const ok = await unlinkGithub(store, "u1");
    expect(ok).toEqual({ ok: true });
    expect((await getUser(store, "u1"))?.github).toBeUndefined();
    expect((await getUser(store, "u1"))?.google?.email).toBe("a@example.com");

    const lastG = await unlinkGoogle(store, "u1");
    expect(lastG).toEqual({ ok: false, error: "last_sso" });
  });

  it("deletes account and revokes credentials", async () => {
    const store = memoryStore();
    await ensureUser(store, "admin", "admin");
    await ensureUser(store, "u1", "user");
    await linkGithub(store, "u1", { id: "gh1", login: "alice" });
    const keyPlain = apiKeyPlaintext();
    await putApiKey(store, keyPlain, "u1", "user");
    const at = await issueAccessToken(store, "u1", "user");

    const lastAdmin = await deleteUserAccount(store, "admin");
    expect(lastAdmin).toEqual({ ok: false, error: "last_admin" });

    const del = await deleteUserAccount(store, "u1");
    expect(del).toEqual({ ok: true });
    expect(await getUser(store, "u1")).toBeNull();
    expect(await lookupApiKey(store, keyPlain)).toBeNull();
    expect(await lookupAccessToken(store, at.plaintext)).toBeNull();
    expect((await listUsers(store)).map((u) => u.userId)).toEqual(["admin"]);
  });
});
