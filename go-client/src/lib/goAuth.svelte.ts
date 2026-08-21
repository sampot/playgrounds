/**
 * go-client login state (DEC-052): play-compatible `#pg_provision=` → memory
 * field API key → `/v1/field/me` profile. Header identity / avatar.
 *
 * Login is a full-page redirect (DEC-054 final): the go client jumps to the
 * dash dedicated `/go/login` page (Google／LINE only), after SSO the dash
 * provisions the user back here via `#pg_provision=`, and `initFromLocation`
 * redeems it in place — no popup / cross-window handoff.
 *
 * Security: the API key lives in page memory only (cleared on unload). The
 * non-secret profile may persist in localStorage so the avatar shows across
 * sessions; the API key never touches storage.
 */

import {
  clearPgProvisionHashFromLocation,
  fetchFieldMe,
  goLoginUrl,
  isFieldCredentialRejected,
  mintPlatformInvite,
  parsePgProvisionFromLocation,
  redeemFieldProvision,
  revokePlatformInvite,
  type FieldMeProfile,
  type MintInviteResult,
} from "./platformClient";
import { INVITE_ROOM_KIND, stampComposeRelayPrefer } from "@pg/platform/platformCompose";
import { goPageOrigin, localizeInviteShortUrl } from "./goOrigin";
import { chromeSession } from "./chromeSession.svelte";
import { BOSS_FLASH } from "./goBossWelcome";

const PROFILE_STORAGE_KEY = "go_auth_profile";
/** Session-scoped memory credential (cleared when the tab closes). */
const API_KEY_STORAGE_KEY = "go_auth_api_key";

export type GoProfile = {
  user_id: string;
  role: "admin" | "user";
  label: string;
  avatar_url: string | null;
  default_field_url: string;
};

function profileFromFieldMe(me: FieldMeProfile): GoProfile {
  // go's login surface is LINE-primary, Google-secondary; prefer the most
  // recently relevant provider avatar. All linked providers are returned by
  // `/v1/field/me`, so pick line → google → github (in provider order).
  const avatar_url =
    me.line?.avatar_url ??
    me.google?.avatar_url ??
    me.github?.avatar_url ??
    null;
  const label = me.line?.display_name
    ? me.line.display_name
    : me.google?.email
      ? me.google.email
      : me.github?.login
        ? `@${me.github.login}`
        : me.user_id;
  return {
    user_id: me.user_id,
    role: me.role,
    label,
    avatar_url,
    default_field_url: me.default_field_url,
  };
}

function readStoredProfile(): GoProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoProfile;
    if (!parsed || typeof parsed.user_id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredProfile(profile: GoProfile | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (profile) localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
}

function readSessionApiKey(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeSessionApiKey(key: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (key) sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    else sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    /* storage unavailable — in-memory only */
  }
}

function clearPageUrl(): string {
  if (typeof location === "undefined") return "/";
  return location.pathname + location.search;
}

function goOrigin(): string {
  return goPageOrigin();
}

class GoAuth {
  /** True once the user has a live (memory) field API key this session. */
  loggedIn = $state(false);
  /** Populated from `/v1/field/me` or restored from localStorage for avatar display. */
  profile = $state<GoProfile | null>(null);
  busy = $state(false);

  /** Redeemed this-session field API key — memory only, never persisted. */
  #apiKey: string | null = null;
  /**
   * Host opted into official TURN (`turn_hosted`＋`turn_prefer` from field/me).
   * Memory only — refreshed with profile; not written to localStorage.
   */
  #turnPrefer = false;

  constructor() {
    this.profile = readStoredProfile();
    // Session-scoped: survive same-tab refreshes / SPA nav; cleared on tab
    // close because sessionStorage is per-tab. No `pagehide` clear — that would
    // drop the credential on a browser refresh (direct URL entry / F5).
    const rehydrated = readSessionApiKey();
    if (rehydrated) {
      this.#apiKey = rehydrated;
      this.loggedIn = true;
    }
  }

  #clearApiKey(): void {
    this.#apiKey = null;
    this.loggedIn = false;
    this.#turnPrefer = false;
    writeSessionApiKey(null);
  }

  #applyFieldMe(me: FieldMeProfile): GoProfile {
    this.#turnPrefer = Boolean(me.turn_hosted) && Boolean(me.turn_prefer);
    this.profile = profileFromFieldMe(me);
    writeStoredProfile(this.profile);
    return this.profile;
  }

  /** Host may use official TURN on session invites (dash「使用連線備援」). */
  wantsTurnRelay(): boolean {
    return this.#turnPrefer;
  }

  clear(): void {
    this.#apiKey = null;
    this.loggedIn = false;
    this.profile = null;
    this.busy = false;
    writeStoredProfile(null);
    writeSessionApiKey(null);
  }

  get isLoggedIn(): boolean {
    return this.loggedIn;
  }

  /**
   * Full-page redirect to the dash dedicated `/go/login` page (DEC-054). After
   * SSO the dash provisions this go origin via `#pg_provision=`, and the page
   * reload redeems it — no popup / cross-window handoff (the OAuth provider's
   * `Cross-Origin-Opener-Policy` severs popup openers, so redirect is used).
   */
  login(): void {
    if (typeof window === "undefined") return;
    // Full-page redirect; record the current page so SSO returns to the same
    // game (not the go root). The provision deep link lands on `?return_to`.
    window.location.assign(
      goLoginUrl(goOrigin(), { returnTo: clearPageUrl() })
    );
  }

  logout(): void {
    this.clear();
    chromeSession.setFlash(BOSS_FLASH.loggedOut);
  }

  /**
   * Consume `#pg_provision=` once at startup: redeem → memory key →
   * fetch profile → clear hash. Same as play (DEC-052). Fails soft.
   *
   * When no fresh provision is present but a session-scoped key was rehydrated
   * (same-tab refresh / direct URL entry), revalidate it against `/v1/field/me`.
   * Only drop the session when Platform rejects the key (401／403); network／
   * offline failures keep the same-tab login + stored profile.
   */
  async initFromLocation(): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.busy) return;
    const parsed = parsePgProvisionFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (parsed) {
      clearPgProvisionHashFromLocation();
      this.busy = true;
      try {
        const { api_key } = await redeemFieldProvision(parsed.token);
        // Redeem first; only then claim the memory credential (persisted to the
        // session so a same-tab refresh keeps login).
        this.#apiKey = api_key;
        writeSessionApiKey(api_key);
        this.loggedIn = true;

        // Re-validate against `/v1/field/me`; on failure drop to stored profile.
        const me = await fetchFieldMe(api_key);
        this.#applyFieldMe(me);

        chromeSession.setFlash(BOSS_FLASH.loggedIn);
      } catch (err) {
        if (this.#apiKey && !isFieldCredentialRejected(err)) {
          // Redeemed, but /me could not reach Platform (offline) — stay signed in.
          chromeSession.setFlash(BOSS_FLASH.loggedIn);
        } else {
          this.#clearApiKey();
          chromeSession.setFlash(BOSS_FLASH.loginExpired);
        }
      } finally {
        this.busy = false;
      }
      return;
    }

    // Rehydrated session key: refresh profile silently. Network blips keep login;
    // only a rejected credential clears the session.
    if (this.#apiKey) {
      this.busy = true;
      try {
        const me = await fetchFieldMe(this.#apiKey);
        this.#applyFieldMe(me);
      } catch (err) {
        if (isFieldCredentialRejected(err)) {
          this.#clearApiKey();
        }
      } finally {
        this.busy = false;
      }
    }
  }

  /**
   * Mint a Platform invite as the logged-in player (GO-INVITE). Uses the page
   * memory field API key; throws an error with `code === "not_provisioned"` when
   * missing / invalid so the UI can route to login. `targetField` = go origin.
   * When Host has turn_prefer, stamps `transport.roster.relay` for Guest.
   */
  async mintPlatformInvite(opts: {
    kind?: string;
    intent?: unknown;
    ttlMs?: number;
  }): Promise<MintInviteResult> {
    const key = this.#apiKey;
    if (!key) {
      const err = new Error("尚未登入遊樂場通行證，請先登入") as Error & {
        code?: string;
      };
      err.code = "not_provisioned";
      throw err;
    }
    const created = await mintPlatformInvite({
      apiKey: key,
      kind: opts.kind,
      intent:
        opts.kind === INVITE_ROOM_KIND
          ? opts.intent
          : stampComposeRelayPrefer(opts.intent, this.#turnPrefer),
      targetField: goOrigin(),
      ttlMs: opts.ttlMs,
    });
    const page = goOrigin();
    return {
      ...created,
      short_url: localizeInviteShortUrl(created.short_url, page),
    };
  }

  /**
   * Hand the memory field API key to the trusted Host answer loop (GO-INVITE).
   * Page-memory only — never exposed to SAM iframes or storage; cleared on
   * unload alongside `#apiKey`.
   */
  getPlatformApiKeyForHostLoop(): string | null {
    return this.#apiKey;
  }

  /** Revoke a hosted invite the current user owns (GO-INVITE). */
  async revokePlatformInvite(inviteId: string): Promise<void> {
    const key = this.#apiKey;
    if (!key) return;
    try {
      await revokePlatformInvite({ inviteId, apiKey: key });
    } catch {
      /* revocation is best-effort */
    }
  }

  /**
   * Re-validate the memory key against `/v1/field/me` (returns live or null). */
  async refreshProfile(): Promise<GoProfile | null> {
    const key = this.#apiKey;
    if (!key) return null;
    try {
      const me = await fetchFieldMe(key);
      return this.#applyFieldMe(me);
    } catch (err) {
      if (isFieldCredentialRejected(err)) {
        this.#clearApiKey();
        return null;
      }
      return this.profile;
    }
  }

  /**
   * Apply a field API key for this tab (validate via `/v1/field/me` first).
   * Used by localhost harness paste／remember — not a product login path.
   */
  async applyFieldApiKey(key: string): Promise<GoProfile> {
    const trimmed = key.trim();
    if (!trimmed) {
      const err = new Error("請貼上 field API key") as Error & { code?: string };
      err.code = "empty_key";
      throw err;
    }
    this.busy = true;
    try {
      const me = await fetchFieldMe(trimmed);
      this.#apiKey = trimmed;
      writeSessionApiKey(trimmed);
      this.loggedIn = true;
      const profile = this.#applyFieldMe(me);
      chromeSession.setFlash(BOSS_FLASH.loggedIn);
      return profile;
    } catch (err) {
      if (isFieldCredentialRejected(err)) {
        this.#clearApiKey();
        const e = new Error("通行證無效或已失效") as Error & { code?: string };
        e.code = "rejected";
        throw e;
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      this.busy = false;
    }
  }

  /** Test seam: inject an in-memory field API key (never touches storage). */
  __setApiKeyForTests(key: string | null): void {
    this.#apiKey = key;
    this.loggedIn = Boolean(key);
    if (!key) this.#turnPrefer = false;
  }

  /** Test seam: inject profile label for Host display name. */
  __setProfileForTests(profile: GoProfile | null): void {
    this.profile = profile;
  }

  /** Test seam: set Host turn_prefer without field/me. */
  __setTurnPreferForTests(prefer: boolean): void {
    this.#turnPrefer = prefer;
  }
}

export const goAuth = new GoAuth();
