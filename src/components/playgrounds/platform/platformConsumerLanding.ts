/**
 * Consumer / play-first landing (no IDE chrome as first paint).
 * `#pg=` Platform invite and `view=canvas` share links.
 */

import { hasPgInviteInLocation } from "./platformInviteUrl";

export function isConsumerPlayLanding(opts?: {
  hash?: string;
  search?: string;
}): boolean {
  if (typeof window === "undefined" && opts?.hash == null && opts?.search == null) {
    return false;
  }
  const hash =
    opts?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const search =
    opts?.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  if (hasPgInviteInLocation({ hash, search })) return true;
  try {
    const q = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
    return q.get("view") === "canvas";
  } catch {
    return false;
  }
}

/** True when URL is a Platform field invite (guest). */
export function isPlatformInviteLanding(opts?: {
  hash?: string;
  search?: string;
}): boolean {
  const hash =
    opts?.hash ?? (typeof window !== "undefined" ? window.location.hash : "");
  const search =
    opts?.search ??
    (typeof window !== "undefined" ? window.location.search : "");
  return hasPgInviteInLocation({ hash, search });
}
