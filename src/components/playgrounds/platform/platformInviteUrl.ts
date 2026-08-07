/**
 * Platform Invite `#pg=` deep-link helpers (DEC-047).
 * Secret is opaque invite secret — not a Roster wire.
 */

import { resolveShortInvite } from "./platformClient";

export const PG_INVITE_HASH_KEY = "pg";

export type PlatformInviteTextRef =
  | { kind: "secret"; secret: string }
  | { kind: "shortId"; shortId: string }
  | { kind: "ambiguous"; value: string };

export type PgInviteFromLocation = {
  secret: string;
};

export function parsePgInviteFromLocation(opts: {
  hash?: string;
  search?: string;
}): PgInviteFromLocation | null {
  const hash = (opts.hash ?? "").replace(/^#/, "");
  let secret: string | null = null;
  if (hash) {
    const params = new URLSearchParams(hash);
    const v = params.get(PG_INVITE_HASH_KEY);
    if (v?.trim()) secret = v.trim();
    if (!secret) {
      const m = hash.match(
        new RegExp(`(?:^|&)${PG_INVITE_HASH_KEY}=([^&]+)`, "i")
      );
      if (m?.[1]) {
        try {
          secret = decodeURIComponent(m[1]).trim();
        } catch {
          secret = m[1].trim();
        }
      }
    }
  }
  if (!secret && opts.search) {
    try {
      const q = new URLSearchParams(
        opts.search.startsWith("?") ? opts.search.slice(1) : opts.search
      ).get(PG_INVITE_HASH_KEY);
      if (q?.trim()) secret = q.trim();
    } catch {
      /* ignore */
    }
  }
  if (!secret) return null;
  return { secret };
}

export function hasPgInviteInLocation(opts: {
  hash?: string;
  search?: string;
}): boolean {
  return parsePgInviteFromLocation(opts) !== null;
}

/** Drop `#pg=` from the address bar after consuming. */
export function clearPgInviteHashFromLocation(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (!hash.includes(`${PG_INVITE_HASH_KEY}=`)) return;
  try {
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  } catch {
    /* ignore */
  }
}

/** Build a same-origin `#pg=` deep link for copy／「用 Safari 開啟」. */
export function buildPgInviteDeepLink(opts: {
  origin: string;
  pathname?: string;
  secret: string;
}): string {
  const origin = opts.origin.replace(/\/$/, "");
  const pathname = opts.pathname?.startsWith("/")
    ? opts.pathname
    : opts.pathname
      ? `/${opts.pathname}`
      : "/";
  const secret = opts.secret.trim();
  if (!secret) throw new Error("invite secret required");
  return `${origin}${pathname}#${PG_INVITE_HASH_KEY}=${encodeURIComponent(secret)}`;
}

/**
 * Extract Platform invite secret／short id from pasted text or scanned QR
 * (short URL、`#pg=`、deep link、opaque code). Not for OOB Roster wire.
 */
export function extractPlatformInviteRefFromText(
  text: string
): PlatformInviteTextRef | null {
  const raw = text.trim();
  if (!raw) return null;

  const fromPgParam = (s: string): string | null => {
    const m = s.match(/(?:^|[?#&])pg=([^&\s#]+)/i);
    if (!m?.[1]) return null;
    try {
      return decodeURIComponent(m[1]).trim() || null;
    } catch {
      return m[1].trim() || null;
    }
  };

  const fromShortPath = (s: string): string | null => {
    const m = s.match(/\/i\/([A-Za-z0-9_-]+)/);
    return m?.[1]?.trim() || null;
  };

  const pgDirect = fromPgParam(raw);
  if (pgDirect) return { kind: "secret", secret: pgDirect };

  const shortDirect = fromShortPath(raw);
  if (shortDirect) return { kind: "shortId", shortId: shortDirect };

  // Full／partial URL without scheme
  const asUrlCandidate = (() => {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(raw) || raw.startsWith("//")) {
      return raw.startsWith("//") ? `https:${raw}` : `https://${raw}`;
    }
    return null;
  })();
  if (asUrlCandidate) {
    try {
      const u = new URL(asUrlCandidate);
      const shortId = fromShortPath(u.pathname);
      if (shortId) return { kind: "shortId", shortId };
      const parsed = parsePgInviteFromLocation({
        hash: u.hash,
        search: u.search,
      });
      if (parsed?.secret) return { kind: "secret", secret: parsed.secret };
    } catch {
      /* fall through */
    }
  }

  // Opaque token: short id or invite secret (same alphabet).
  if (/^[A-Za-z0-9_-]{6,200}$/.test(raw) && !raw.includes(".")) {
    return { kind: "ambiguous", value: raw };
  }

  return null;
}

/** Resolve pasted／scanned invite text to Platform invite secret. */
export async function resolvePlatformInviteSecretFromText(
  text: string,
  origin?: string
): Promise<string> {
  const ref = extractPlatformInviteRefFromText(text);
  if (!ref) {
    throw new Error("無法辨識邀請連結或邀請碼");
  }
  if (ref.kind === "secret") return ref.secret;
  if (ref.kind === "shortId") {
    const mapped = await resolveShortInvite(ref.shortId, origin);
    return mapped.secret;
  }
  try {
    const mapped = await resolveShortInvite(ref.value, origin);
    return mapped.secret;
  } catch {
    return ref.value;
  }
}
