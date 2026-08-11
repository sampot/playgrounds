/**
 * Shared SSO intent completion (GitHub / Google) for Platform dash (DEC-047).
 */

import {
  claimRegistrationInvite,
  ensureUser,
  getRegistrationInvite,
  getUser,
  getUserIdByGithub,
  getUserIdByGoogle,
  isBootstrapped,
  issueAccessToken,
  linkGithub,
  linkGoogle,
  markBootstrapped,
  putApiKey,
  type EnvStore,
} from "./auth.js";
import { apiKeyPlaintext } from "./ids.js";
import type { OAuthIntent } from "./githubOAuth.js";

export type SsoProvider = "github" | "google";

export type SsoSubject = {
  provider: SsoProvider;
  id: string;
  /** github login or google email */
  label: string;
  /** avatar URL from provider profile (DEC-052); optional */
  avatarUrl?: string | null;
};

type StatePayload = OAuthIntent & { n: string; exp: number };

export type SsoEnv = {
  STORE: EnvStore & {
    put(
      key: string,
      value: string,
      options?: { expirationTtl?: number }
    ): Promise<void>;
  };
  ADMIN_BOOTSTRAP_TOKEN?: string;
};

function alreadyLinkedError(provider: SsoProvider): string {
  return provider === "github" ? "github_already_linked" : "google_already_linked";
}

function adminMismatchError(provider: SsoProvider): string {
  return provider === "github"
    ? "admin_github_mismatch"
    : "admin_google_mismatch";
}

async function getUserIdBySso(
  store: EnvStore,
  subject: SsoSubject
): Promise<string | null> {
  return subject.provider === "github"
    ? getUserIdByGithub(store, subject.id)
    : getUserIdByGoogle(store, subject.id);
}

async function linkSso(
  store: EnvStore,
  userId: string,
  subject: SsoSubject
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (subject.provider === "github") {
    return linkGithub(store, userId, {
      id: subject.id,
      login: subject.label,
      avatarUrl: subject.avatarUrl,
    });
  }
  return linkGoogle(store, userId, {
    id: subject.id,
    email: subject.label,
    avatarUrl: subject.avatarUrl,
  });
}

function linkedIdOnUser(
  user: Awaited<ReturnType<typeof getUser>>,
  provider: SsoProvider
): string | undefined {
  if (!user) return undefined;
  return provider === "github" ? user.github?.id : user.google?.id;
}

/**
 * Complete login / link / bootstrap / join after provider profile is known.
 * Caller supplies `success` / `fail` redirects.
 */
export async function completeSsoIntent(opts: {
  env: SsoEnv;
  state: StatePayload;
  subject: SsoSubject;
  success: (
    accessToken: string,
    expiresAt: number,
    extraQuery?: string
  ) => Promise<Response> | Response;
  fail: (code: string) => Response;
}): Promise<Response> {
  const { env, state, subject, success, fail } = opts;
  const store = env.STORE;

  if (state.intent === "login") {
    const userId = await getUserIdBySso(store, subject);
    if (!userId) return fail("need_invite_or_link");
    const user = await getUser(store, userId);
    if (!user || user.disabled) return fail("forbidden");
    const at = await issueAccessToken(store, user.userId, user.role);
    return success(at.plaintext, at.record.expiresAt);
  }

  if (state.intent === "link") {
    const linked = await linkSso(store, state.userId, subject);
    if (!linked.ok) return fail(linked.error);
    const user = await getUser(store, state.userId);
    if (!user) return fail("user_not_found");
    const at = await issueAccessToken(store, user.userId, user.role);
    return success(at.plaintext, at.record.expiresAt, "linked=1");
  }

  if (state.intent === "bootstrap") {
    const expected = env.ADMIN_BOOTSTRAP_TOKEN;
    if (!expected || state.bootstrapToken !== expected) {
      return fail("unauthorized");
    }
    const userId = "admin";
    const already = await isBootstrapped(store);

    if (already) {
      await ensureUser(store, userId, "admin");
      const admin = await getUser(store, userId);
      if (!admin) return fail("user_not_found");
      const owner = await getUserIdBySso(store, subject);
      if (owner && owner !== userId) {
        return fail(alreadyLinkedError(subject.provider));
      }
      const existingId = linkedIdOnUser(admin, subject.provider);
      if (existingId && existingId !== subject.id) {
        return fail(adminMismatchError(subject.provider));
      }
      if (!existingId) {
        const linked = await linkSso(store, userId, subject);
        if (!linked.ok) return fail(linked.error);
      }
      const at = await issueAccessToken(store, userId, "admin");
      return success(at.plaintext, at.record.expiresAt, "linked=1");
    }

    await ensureUser(store, userId, "admin");
    const plaintext = apiKeyPlaintext();
    await putApiKey(store, plaintext, userId, "admin");
    const linked = await linkSso(store, userId, subject);
    if (!linked.ok) return fail(linked.error);
    await markBootstrapped(store);
    const at = await issueAccessToken(store, userId, "admin");
    await store.put(`reveal:user:${userId}`, plaintext, {
      expirationTtl: 600,
    });
    return success(at.plaintext, at.record.expiresAt, "bootstrap=1");
  }

  if (state.intent === "join") {
    const inv = await getRegistrationInvite(store, state.inviteToken);
    if (!inv) return fail("invite_not_found");
    if (Date.now() >= inv.expiresAt || inv.usedAt) {
      return fail("invite_gone");
    }
    const existingId = await getUserIdBySso(store, subject);
    if (existingId) {
      const user = await getUser(store, existingId);
      if (!user || user.disabled) return fail("forbidden");
      const at = await issueAccessToken(store, user.userId, user.role);
      return success(at.plaintext, at.record.expiresAt);
    }
    const claimed = await claimRegistrationInvite(
      store,
      state.inviteToken,
      "user"
    );
    if (!claimed.ok) return fail(claimed.error);
    const linked = await linkSso(store, claimed.userId, subject);
    if (!linked.ok) return fail(linked.error);
    return success(
      claimed.accessToken,
      claimed.accessTokenExpiresAt,
      "claimed=1"
    );
  }

  return fail("unknown_intent");
}
