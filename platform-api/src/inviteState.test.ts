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
  ensureUser,
  getApiKeyForUser,
  getUserIdByGithub,
  getUserIdByGoogle,
  isBootstrapped,
  issueAccessToken,
  linkGithub,
  linkGoogle,
  lookupAccessToken,
  lookupApiKey,
  markBootstrapped,
  putApiKey,
  revokeAccessToken,
  type EnvStore,
} from "./auth.js";
import { decodeOAuthState, encodeOAuthState } from "./githubOAuth.js";
import { completeSsoIntent } from "./ssoFlow.js";
import {
  createInviteRecord,
  enqueueOffer,
  getAnswer,
  peekPending,
  putAnswer,
  registerJoin,
  revokeInvite,
} from "./inviteState.js";

function memoryStore(): EnvStore & {
  data: Map<string, string>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
} {
  const data = new Map<string, string>();
  return {
    data,
    async get(key: string) {
      return data.get(key) ?? null;
    },
    async put(key: string, value: string, _options?: { expirationTtl?: number }) {
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
    expect(fieldDeepLink("http://localhost:5173", "sec")).toBe(
      "http://localhost:5173/#pg=sec"
    );
    expect(fieldDeepLink("localhost:5173", "sec")).toBe(
      "http://localhost:5173/#pg=sec"
    );
    expect(shortUrl("abc")).toBe("https://go.samkuo.me/i/abc");
    expect(shortUrl("abc", "http://localhost:5174")).toBe(
      "http://localhost:5174/i/abc"
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

describe("access token", () => {
  it("issues and looks up; API key lookup rejects at prefix", async () => {
    const store = memoryStore();
    const { plaintext, record } = await issueAccessToken(store, "u1", "user");
    expect(plaintext.startsWith("pg_at_")).toBe(true);
    const found = await lookupAccessToken(store, plaintext);
    expect(found?.userId).toBe("u1");
    expect(found?.role).toBe("user");
    expect(found?.expiresAt).toBe(record.expiresAt);
    expect(await lookupApiKey(store, plaintext)).toBeNull();
  });

  it("revokes access token", async () => {
    const store = memoryStore();
    const { plaintext } = await issueAccessToken(store, "u1", "admin");
    expect(await revokeAccessToken(store, plaintext)).toBe(true);
    expect(await lookupAccessToken(store, plaintext)).toBeNull();
  });
});

describe("github oauth state + link", () => {
  it("round-trips signed state", async () => {
    const secret = "test-state-secret";
    const encoded = await encodeOAuthState(secret, { intent: "login" });
    const decoded = await decodeOAuthState(secret, encoded);
    expect(decoded?.intent).toBe("login");
    expect(await decodeOAuthState("wrong", encoded)).toBeNull();
  });

  it("links github to user once", async () => {
    const store = memoryStore();
    await ensureUser(store, "admin", "admin");
    const ok = await linkGithub(store, "admin", { id: "42", login: "sam" });
    expect(ok.ok).toBe(true);
    expect(await getUserIdByGithub(store, "42")).toBe("admin");
    await ensureUser(store, "other", "user");
    const clash = await linkGithub(store, "other", { id: "42", login: "sam" });
    expect(clash.ok).toBe(false);
  });
});

describe("google oauth link + sso flow", () => {
  it("links google to user once and allows dual providers", async () => {
    const store = memoryStore();
    await ensureUser(store, "admin", "admin");
    expect(
      (
        await linkGoogle(store, "admin", {
          id: "g-sub-1",
          email: "sam@example.com",
        })
      ).ok
    ).toBe(true);
    expect(await getUserIdByGoogle(store, "g-sub-1")).toBe("admin");
    expect(
      (await linkGithub(store, "admin", { id: "42", login: "sam" })).ok
    ).toBe(true);
    await ensureUser(store, "other", "user");
    const clash = await linkGoogle(store, "other", {
      id: "g-sub-1",
      email: "sam@example.com",
    });
    expect(clash.ok).toBe(false);
  });

  it("completeSsoIntent login requires prior link", async () => {
    const store = memoryStore();
    const fails: string[] = [];
    const res = await completeSsoIntent({
      env: { STORE: store },
      state: {
        intent: "login",
        n: "x",
        exp: Date.now() + 60_000,
      },
      subject: { provider: "google", id: "g1", label: "a@b.c" },
      fail: (c) => {
        fails.push(c);
        return new Response(c, { status: 400 });
      },
      success: async () => new Response("ok"),
    });
    expect(fails).toEqual(["need_invite_or_link"]);
    expect(await res.text()).toBe("need_invite_or_link");
  });

  it("completeSsoIntent login after google link", async () => {
    const store = memoryStore();
    await ensureUser(store, "u1", "user");
    await linkGoogle(store, "u1", { id: "g1", email: "a@b.c" });
    let token = "";
    const res = await completeSsoIntent({
      env: { STORE: store },
      state: {
        intent: "login",
        n: "x",
        exp: Date.now() + 60_000,
      },
      subject: { provider: "google", id: "g1", label: "a@b.c" },
      fail: (c) => new Response(c, { status: 400 }),
      success: async (accessToken) => {
        token = accessToken;
        return new Response("ok");
      },
    });
    expect(await res.text()).toBe("ok");
    expect(token.startsWith("pg_at_")).toBe(true);
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
