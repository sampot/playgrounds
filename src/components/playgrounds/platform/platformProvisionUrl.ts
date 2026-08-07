/**
 * Host provision deep-link `#pg_provision=` (DEC-047).
 * ≠ `#pg=` field Invite.
 */

export const PG_PROVISION_HASH_KEY = "pg_provision";

export function parsePgProvisionFromLocation(opts: {
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

export function hasPgProvisionInLocation(opts: {
  hash?: string;
  search?: string;
}): boolean {
  return parsePgProvisionFromLocation(opts) !== null;
}

export function clearPgProvisionHashFromLocation(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (!hash.includes(`${PG_PROVISION_HASH_KEY}=`)) return;
  try {
    window.history.replaceState(window.history.state, "", `${pathname}${search}`);
  } catch {
    /* ignore */
  }
}
