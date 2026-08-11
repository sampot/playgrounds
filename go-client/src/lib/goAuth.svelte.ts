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
  parsePgProvisionFromLocation,
  redeemFieldProvision,
  type FieldMeProfile,
} from "./platformClient";
import { chromeSession } from "./chromeSession.svelte";

const PROFILE_STORAGE_KEY = "go_auth_profile";

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

function goOrigin(): string {
  if (typeof location !== "undefined" && location.origin) {
    const host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) {
      return location.origin;
    }
  }
  return "https://go.samkuo.me";
}

class GoAuth {
  /** True once the user has a live (memory) field API key this session. */
  loggedIn = $state(false);
  /** Populated from `/v1/field/me` or restored from localStorage for avatar display. */
  profile = $state<GoProfile | null>(null);
  busy = $state(false);

  /** Redeemed this-session field API key — memory only, never persisted. */
  #apiKey: string | null = null;

  constructor() {
    this.profile = readStoredProfile();
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => {
        this.#clearApiKey();
      });
    }
  }

  #clearApiKey(): void {
    this.#apiKey = null;
    this.loggedIn = false;
  }

  clear(): void {
    this.#apiKey = null;
    this.loggedIn = false;
    this.profile = null;
    this.busy = false;
    writeStoredProfile(null);
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
    window.location.assign(goLoginUrl(goOrigin()));
  }

  logout(): void {
    this.clear();
    chromeSession.setFlash("已登出");
  }

  /**
   * Consume `#pg_provision=` once at startup: redeem → memory key →
   * fetch profile → clear hash. Same as play (DEC-052). Fails soft.
   */
  async initFromLocation(): Promise<void> {
    if (typeof window === "undefined") return;
    const parsed = parsePgProvisionFromLocation({
      hash: window.location.hash,
      search: window.location.search,
    });
    if (!parsed) return;
    clearPgProvisionHashFromLocation();
    if (this.busy) return;
    this.busy = true;
    try {
      const { api_key } = await redeemFieldProvision(parsed.token);
      // Redeem first; only then claim the memory credential.
      this.#apiKey = api_key;
      this.loggedIn = true;

      // Re-validate against `/v1/field/me`; on failure drop to stored profile.
      const me = await fetchFieldMe(api_key);
      this.profile = profileFromFieldMe(me);
      writeStoredProfile(this.profile);

      chromeSession.setFlash("已登入");
    } catch (err) {
      this.#clearApiKey();
      chromeSession.setFlash("登入確認已失效，請從後台重新登入");
    } finally {
      this.busy = false;
    }
  }

  /** Re-validate the memory key against `/v1/field/me` (returns live or null). */
  async refreshProfile(): Promise<GoProfile | null> {
    const key = this.#apiKey;
    if (!key) return null;
    try {
      const me = await fetchFieldMe(key);
      this.profile = profileFromFieldMe(me);
      writeStoredProfile(this.profile);
      return this.profile;
    } catch {
      this.#clearApiKey();
      return null;
    }
  }
}

export const goAuth = new GoAuth();
