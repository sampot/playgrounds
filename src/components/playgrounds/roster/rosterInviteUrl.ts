/**
 * Roster invite deep-link helpers (DEC-045 Phase 4.1).
 * Hash carries the same compressed wire as QR／文字 — no Worker room.
 */

import { decodeRosterWire, type RosterWirePayload } from "./rosterWire";

export const ROSTER_INVITE_HASH_KEY = "roster";

export type RosterInviteFromLocation = {
  wire: string;
  role: RosterWirePayload["role"];
  lan: boolean;
};

/** Build a shareable invite／reply URL (`#roster=<wire>`). */
export function buildRosterInviteUrl(opts: {
  origin: string;
  pathname?: string;
  wire: string;
}): string {
  const wire = opts.wire.trim().replace(/\s+/g, "");
  if (!wire) throw new Error("邀請字串為空");
  const origin = opts.origin.replace(/\/$/, "");
  let path = opts.pathname?.trim() || "/";
  if (!path.startsWith("/")) path = `/${path}`;
  const normalized =
    path === "/" ? `${origin}/` : `${origin}${path.replace(/\/+$/, "")}`;
  return `${normalized}#${ROSTER_INVITE_HASH_KEY}=${wire}`;
}

/**
 * Pull a roster wire out of raw paste: bare wire, or a full invite URL.
 */
export function extractRosterWireFromText(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  const fromHash = raw.match(
    new RegExp(`[#&?]${ROSTER_INVITE_HASH_KEY}=([^\\s&#]+)`, "i")
  );
  if (fromHash?.[1]) {
    try {
      return decodeURIComponent(fromHash[1]).replace(/\s+/g, "");
    } catch {
      return fromHash[1].replace(/\s+/g, "");
    }
  }

  // Full URL with hash — URL() may drop hash on relative; try manually.
  try {
    const asUrl = new URL(raw);
    const h = asUrl.hash.replace(/^#/, "");
    const m = h.match(new RegExp(`(?:^|&)${ROSTER_INVITE_HASH_KEY}=([^&]+)`, "i"));
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1]).replace(/\s+/g, "");
      } catch {
        return m[1].replace(/\s+/g, "");
      }
    }
    const q = asUrl.searchParams.get(ROSTER_INVITE_HASH_KEY);
    if (q?.trim()) return q.trim().replace(/\s+/g, "");
  } catch {
    /* not a URL */
  }

  const compact = raw.replace(/\s+/g, "");
  if (/^[A-Za-z0-9_-]+$/.test(compact)) return compact;
  return null;
}

export function parseRosterInviteFromLocation(opts: {
  hash?: string;
  search?: string;
}): RosterInviteFromLocation | null {
  const hash = (opts.hash ?? "").replace(/^#/, "");
  let wire: string | null = null;
  if (hash) {
    const params = new URLSearchParams(hash);
    const v = params.get(ROSTER_INVITE_HASH_KEY);
    if (v?.trim()) wire = v.trim().replace(/\s+/g, "");
    if (!wire) {
      const m = hash.match(
        new RegExp(`(?:^|&)${ROSTER_INVITE_HASH_KEY}=([^&]+)`, "i")
      );
      if (m?.[1]) {
        try {
          wire = decodeURIComponent(m[1]).replace(/\s+/g, "");
        } catch {
          wire = m[1].replace(/\s+/g, "");
        }
      }
    }
  }
  if (!wire && opts.search) {
    try {
      const q = new URLSearchParams(
        opts.search.startsWith("?") ? opts.search.slice(1) : opts.search
      ).get(ROSTER_INVITE_HASH_KEY);
      if (q?.trim()) wire = q.trim().replace(/\s+/g, "");
    } catch {
      /* ignore */
    }
  }
  if (!wire) return null;
  try {
    const payload = decodeRosterWire(wire);
    return {
      wire,
      role: payload.role,
      lan: Boolean(payload.lan),
    };
  } catch {
    return null;
  }
}

export function hasRosterInviteInLocation(opts: {
  hash?: string;
  search?: string;
}): boolean {
  return parseRosterInviteFromLocation(opts) !== null;
}

/** Drop `#roster=` from the address bar after consuming. */
export function clearRosterInviteHashFromLocation(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (!hash.includes(`${ROSTER_INVITE_HASH_KEY}=`)) return;
  const next = `${pathname}${search}`;
  try {
    window.history.replaceState(window.history.state, "", next);
  } catch {
    /* ignore */
  }
}
