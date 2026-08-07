import { describe, expect, it } from "vitest";
import { filterIceServers } from "./turn.js";
import {
  addCredits,
  debitTurnCredentials,
  setTurnHosted,
  setTurnPrefer,
  userCredits,
  userTurnHosted,
  userTurnPrefer,
} from "./credits.js";
import { ensureUser, type EnvStore } from "./auth.js";

function memoryStore(): EnvStore {
  const m = new Map<string, string>();
  return {
    get: async (k) => m.get(k) ?? null,
    put: async (k, v) => {
      m.set(k, v);
    },
    delete: async (k) => {
      m.delete(k);
    },
  };
}

describe("filterIceServers", () => {
  it("drops port 53 urls", () => {
    const out = filterIceServers([
      {
        urls: [
          "stun:stun.cloudflare.com:3478",
          "stun:stun.cloudflare.com:53",
        ],
      },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:53?transport=udp",
        ],
        username: "u",
        credential: "c",
      },
    ]);
    expect(JSON.stringify(out)).not.toContain(":53");
    expect(out).toHaveLength(2);
  });
});

describe("credits + turn entitlement", () => {
  it("addCredits and debit require entitlement", async () => {
    const store = memoryStore();
    await ensureUser(store, "u1", "user");
    const topped = await addCredits(store, "u1", 5, "test");
    expect(topped.ok).toBe(true);
    if (!topped.ok) return;
    expect(topped.balance).toBe(5);

    const deny = await debitTurnCredentials(store, "u1");
    expect(deny.ok).toBe(false);
    if (!deny.ok) expect(deny.error).toBe("turn_not_entitled");

    await setTurnHosted(store, "u1", true);
    const stillDeny = await debitTurnCredentials(store, "u1");
    expect(stillDeny.ok).toBe(false);
    if (!stillDeny.ok) expect(stillDeny.error).toBe("turn_not_preferred");

    const pref = await setTurnPrefer(store, "u1", true);
    expect(pref.ok).toBe(true);

    const ok = await debitTurnCredentials(store, "u1", "sess1");
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.balance).toBe(4);

    const user = await ensureUser(store, "u1", "user");
    expect(userCredits(user)).toBe(4);
    expect(userTurnHosted(user)).toBe(true);
    expect(userTurnPrefer(user)).toBe(true);
  });

  it("cannot prefer without entitlement; closing entitlement clears prefer", async () => {
    const store = memoryStore();
    await ensureUser(store, "u2", "user");
    const deny = await setTurnPrefer(store, "u2", true);
    expect(deny.ok).toBe(false);
    if (!deny.ok) expect(deny.error).toBe("turn_not_entitled");

    await setTurnHosted(store, "u2", true);
    await setTurnPrefer(store, "u2", true);
    expect(userTurnPrefer(await ensureUser(store, "u2", "user"))).toBe(true);

    await setTurnHosted(store, "u2", false);
    const user = await ensureUser(store, "u2", "user");
    expect(userTurnHosted(user)).toBe(false);
    expect(userTurnPrefer(user)).toBe(false);
  });
});
