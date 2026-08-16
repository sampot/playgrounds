/**
 * Platform API origin (DEC-047／050). Always the official API host —
 * no Vite dev proxy, even in local dev. Override via `VITE_PLATFORM_API_ORIGIN`
 * only for tests／self-hosting.
 */
export function platformApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_PLATFORM_API_ORIGIN as string | undefined;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return "https://api.samkuo.me";
}

export type InvitePreview = {
  kind?: string;
  open?: boolean;
  revoked?: boolean;
  expires_at?: number;
  intent?: unknown;
};

/**
 * Resolve short id → invite secret via Platform `GET /v1/shorts/:id`.
 * Prefer shared `@pg/platform/platformClient.resolveShortInvite` when importing
 * from field modules; this helper remains for go-local callers.
 */
export async function previewInviteBySecret(
  secret: string
): Promise<InvitePreview> {
  const origin = platformApiOrigin();
  const url = `${origin}/v1/invites/${encodeURIComponent(secret)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "邀請不存在或已失效" : "無法讀取邀請");
  }
  return (await res.json()) as InvitePreview;
}

/* ------------------------------------------------------------------ *
 *  Login (DEC-052): play-compatible `#pg_provision=` → field API key.
 * ------------------------------------------------------------------ */

export const GO_DASH_ORIGIN = "https://dash.samkuo.me";

/**
 * Dashboard origin for go login redirect. Always the official dash host —
 * local dev relies on CORS (localhost allowed) rather than same-origin proxy.
 * Override via `VITE_PLATFORM_DASH_ORIGIN` only for tests／self-hosting.
 */
export function goDashOrigin(): string {
  const fromEnv = import.meta.env.VITE_PLATFORM_DASH_ORIGIN as string | undefined;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  return GO_DASH_ORIGIN;
}

/**
 * Dedicated minimal go login page on dash (only Google／LINE, DEC-054). The go
 * client redirects here (full-page, no popup): after SSO the dash provisions
 * the user back to this go origin via the existing `#pg_provision=` pipeline
 * (same as play, DEC-052) — no cross-window handoff needed.
 */
export const GO_LOGIN_PATH = "/go/login";

/**
 * Full-page login URL for go (DEC-054): dash's dedicated `/go/login` page with
 * `?field=` so after SSO the user is provisioned back to this go origin.
 * `?return_to=` records the current page (default `/`) so SSO returns to the
 * same game instead of the go root.
 */
export function goLoginUrl(
  fieldOrigin: string,
  opts?: { returnTo?: string }
): string {
  const dash = goDashOrigin().replace(/\/$/, "");
  const url = new URL(`${dash}${GO_LOGIN_PATH}`);
  if (fieldOrigin.trim()) url.searchParams.set("field", fieldOrigin.trim());
  const ret = sanitizeReturnPath(opts?.returnTo);
  if (ret && ret !== "/") url.searchParams.set("return_to", ret);
  return url.toString();
}

/**
 * Sanitize a dash-relative-ish return path so it can't escape the origin or
 * split the provision fragment. Returns null when unusable.
 */
export function sanitizeReturnPath(
  input: string | undefined | null
): string | null {
  if (!input) return null;
  let raw = input.trim();
  if (!raw || raw === "/") return "/";
  // Reject absolute URLs / protocol-relative — only a same-origin path is valid.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("//")) return null;
  if (raw.includes("#")) return null;
  if (raw.split("/").includes("..")) return null;
  try {
    const u = new URL(raw, "https://go.samkuo.me");
    raw = u.pathname + u.search;
  } catch {
    return null;
  }
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.split("/").includes("..")) return null;
  if (raw.length > 512) return null;
  return raw;
}

/** Redeem one-time provision token → { api_key } (field API key). */
export async function redeemFieldProvision(
  provisionToken: string
): Promise<{ api_key: string }> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/field/provision/redeem`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provision_token: provisionToken }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 410
        ? "同意入座已過期或已被使用，請從後台重新登入"
        : text || "無法兌換登入確認"
    );
  }
  return (await res.json()) as { api_key: string };
}

export type FieldMeProfile = {
  user_id: string;
  role: "admin" | "user";
  github: { login: string; avatar_url: string | null } | null;
  google: { email: string; avatar_url: string | null } | null;
  line: { display_name: string; avatar_url: string | null } | null;
  default_field_url: string;
};

/** Resolve self profile by field API key (DEC-052). */
export async function fetchFieldMe(
  apiKey: string
): Promise<FieldMeProfile> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/field/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error("無法讀取身分資料");
  }
  return (await res.json()) as FieldMeProfile;
}

export type MintInviteResult = {
  invite_id: string;
  kind: string;
  /** Unix ms (Platform API). */
  expires_at: number;
  short_url: string;
  deep_link: string;
  secret: string;
};

/**
 * Mint a Platform invite with a logged-in user's memory field API key (GO-INVITE).
 * `targetField` = the go origin so short_url / deep_link land on go.
 */
export async function mintPlatformInvite(opts: {
  apiKey: string;
  kind?: string;
  intent?: unknown;
  targetField?: string;
  ttlMs?: number;
}): Promise<MintInviteResult> {
  const origin = platformApiOrigin();
  const res = await fetch(`${origin}/v1/invites`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      kind: opts.kind,
      intent: opts.intent,
      targetField: opts.targetField,
      ttlMs: opts.ttlMs,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const code = res.status === 401 ? "not_provisioned" : "error";
    const message =
      code === "not_provisioned" ? "通行證已失效，請重新登入" : text || "無法建立邀請";
    const err = new Error(message) as Error & { code?: string };
    err.code = code;
    throw err;
  }
  return (await res.json()) as MintInviteResult;
}

export const PG_PROVISION_HASH_KEY = "pg_provision";

/** Revoke an invite owned by the current user (GO-INVITE). Best-effort. */
export async function revokePlatformInvite(opts: {
  inviteId: string;
  apiKey: string;
}): Promise<void> {
  const origin = platformApiOrigin();
  const res = await fetch(
    `${origin}/v1/invites/${encodeURIComponent(opts.inviteId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    }
  );
  if (!res.ok) {
    throw new Error("無法撤銷邀請");
  }
}export function parsePgProvisionFromLocation(opts: {
  hash?: string;
  search?: string;
}): { token: string } | null {
  const hash = (opts.hash ?? "").replace(/^#/, "");
  let token: string | null = null;
  if (hash) {
    const params = new URLSearchParams(hash);
    const v = params.get(PG_PROVISION_HASH_KEY);
    if (v?.trim()) token = v.trim();
    if (!token) {
      const m = hash.match(
        new RegExp(`(?:^|&)${PG_PROVISION_HASH_KEY}=([^&]+)`, "i")
      );
      if (m?.[1]) {
        try {
          token = decodeURIComponent(m[1]).trim();
        } catch {
          token = m[1].trim();
        }
      }
    }
  }
  if (!token && opts.search) {
    try {
      const q = new URLSearchParams(
        opts.search.startsWith("?") ? opts.search.slice(1) : opts.search
      ).get(PG_PROVISION_HASH_KEY);
      if (q?.trim()) token = q.trim();
    } catch {
      /* ignore */
    }
  }
  if (!token) return null;
  return { token };
}

export function clearPgProvisionHashFromLocation(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (!hash.includes(`${PG_PROVISION_HASH_KEY}=`)) return;
  try {
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}`
    );
  } catch {
    /* ignore */
  }
}
