/**
 * Platform Invite `#pg=` deep-link helpers (DEC-047).
 * Secret is opaque invite secret — not a Roster wire.
 */

export const PG_INVITE_HASH_KEY = "pg";

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
