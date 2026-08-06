import { describe, expect, it } from "vitest";
import {
  apiKeyPlaintext,
  fieldDeepLink,
  INVITE_TTL_MS,
  keyPrefix,
  sha256Hex,
  shortUrl,
} from "./ids.js";
import {
  deleteApiKey,
  getApiKeyForUser,
  isBootstrapped,
  lookupApiKey,
  markBootstrapped,
  putApiKey,
  type EnvStore,
} from "./auth.js";
import {
  createInviteRecord,
  enqueueOffer,
  getAnswer,
  peekPending,
  putAnswer,
  registerJoin,
  revokeInvite,
} from "./inviteState.js";

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

describe("ids", () => {
  it("hashes stably", async () => {
    const a = await sha256Hex("hello");
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("builds deep link and short url", () => {
    expect(fieldDeepLink("play.samkuo.me", "sec")).toBe(
      "https://play.samkuo.me/#pg=sec"
    );
    expect(shortUrl("https://api.samkuo.me", "abc")).toBe(
      "https://api.samkuo.me/i/abc"
    );
  });

  it("default invite TTL is 5 minutes", () => {
    expect(INVITE_TTL_MS).toBe(5 * 60 * 1000);
  });
});

describe("auth bootstrap + api key", () => {
  it("bootstrap flag and single key rotation", async () => {
    const store = memoryStore();
    expect(await isBootstrapped(store)).toBe(false);
    const k1 = apiKeyPlaintext();
    await putApiKey(store, k1, "admin", "admin");
    await markBootstrapped(store);
    expect(await isBootstrapped(store)).toBe(true);

    const found = await lookupApiKey(store, k1);
    expect(found?.userId).toBe("admin");
    expect(found?.prefix).toBe(keyPrefix(k1));

    const k2 = apiKeyPlaintext();
    await putApiKey(store, k2, "admin", "admin");
    expect(await lookupApiKey(store, k1)).toBeNull();
    expect((await lookupApiKey(store, k2))?.userId).toBe("admin");
  });

  it("revokes the only key", async () => {
    const store = memoryStore();
    const k = apiKeyPlaintext();
    await putApiKey(store, k, "admin", "admin");
    expect(await getApiKeyForUser(store, "admin")).not.toBeNull();
    expect(await deleteApiKey(store, "admin")).toBe(true);
    expect(await lookupApiKey(store, k)).toBeNull();
    expect(await getApiKeyForUser(store, "admin")).toBeNull();
  });
});

describe("invite handshake queue", () => {
  it("FIFO: second offer waits until first answered", async () => {
    const now = 1_000_000;
    const rec = createInviteRecord({
      inviteId: "inv1",
      secret: "sec",
      shortId: "s1",
      ownerUserId: "admin",
      kind: "signal.handshake",
      intent: {},
      targetField: "play.samkuo.me",
      now,
      ttlMs: INVITE_TTL_MS,
    });

    const h1 = await sha256Hex("cap1");
    const h2 = await sha256Hex("cap2");
    expect(registerJoin(rec, h1, "j1", now).ok).toBe(true);
    expect(registerJoin(rec, h2, "j2", now).ok).toBe(true);

    const e1 = enqueueOffer(rec, h1, "offer-a", now);
    const e2 = enqueueOffer(rec, h2, "offer-b", now);
    expect(e1.ok && e1.position).toBe(0);
    expect(e2.ok && e2.position).toBe(1);

    const pending1 = peekPending(rec, "admin");
    expect(pending1.ok && pending1.slot.offerWire).toBe("offer-a");

    const ans1 = putAnswer(rec, "admin", "answer-a", now);
    expect(ans1.ok).toBe(true);
    expect(getAnswer(rec, "j1")).toBe("answer-a");

    const pending2 = peekPending(rec, "admin");
    expect(pending2.ok && pending2.slot.offerWire).toBe("offer-b");

    putAnswer(rec, "admin", "answer-b", now);
    expect(getAnswer(rec, "j2")).toBe("answer-b");
    expect(peekPending(rec, "admin").ok).toBe(false);
  });

  it("rejects joins after revoke", async () => {
    const now = 1_000_000;
    const rec = createInviteRecord({
      inviteId: "inv1",
      secret: "sec",
      shortId: "s1",
      ownerUserId: "admin",
      kind: "signal.handshake",
      intent: {},
      targetField: "play.samkuo.me",
      now,
      ttlMs: INVITE_TTL_MS,
    });
    revokeInvite(rec);
    const h = await sha256Hex("cap");
    const r = registerJoin(rec, h, "j", now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(410);
  });

  it("rejects after TTL", async () => {
    const now = 1_000_000;
    const rec = createInviteRecord({
      inviteId: "inv1",
      secret: "sec",
      shortId: "s1",
      ownerUserId: "admin",
      kind: "signal.handshake",
      intent: {},
      targetField: "play.samkuo.me",
      now,
      ttlMs: 1000,
    });
    const h = await sha256Hex("cap");
    const r = registerJoin(rec, h, "j", now + 2000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(410);
  });
});
