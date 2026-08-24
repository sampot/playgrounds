/**
 * Booth Hub state helpers (PG-GO-ROOM-ENGINE-PLAN §7.5).
 * Wire types live in @pg/roster/boothChannel.
 */

export type {
  BoothErrorCode,
  BoothFileSummary,
  BoothMemberKind,
  BoothStateSnapshot,
  BoothSubscribeScope,
} from "@pg/roster/boothChannel";

export type BoothDirectorLock = {
  shellId: string;
  role: "host" | "operator";
};

export type BoothPeerCapRecord = {
  peerCapId: string;
  peerCap: string;
  label?: string;
  expiresAt: number;
  revoked: boolean;
};

export const DEFAULT_PEER_CAP_TTL_MS = 24 * 60 * 60 * 1000;

export function boothShellCanDirect(input: {
  director: BoothDirectorLock | null;
  shellId: string;
  localHostClaimsDirector: boolean;
  role: "host" | "operator" | "viewer";
}): boolean {
  if (input.localHostClaimsDirector && input.role === "host") return true;
  if (!input.director) return input.role === "host";
  return input.director.shellId === input.shellId;
}

export function pickOperatorDirectorRole(input: {
  shellId: string;
  director: BoothDirectorLock | null;
  localHostClaimsDirector: boolean;
}): { role: "operator" | "viewer"; director?: BoothDirectorLock } {
  if (input.localHostClaimsDirector) {
    return { role: "viewer" };
  }
  if (!input.director || input.director.shellId === input.shellId) {
    const lock: BoothDirectorLock = { shellId: input.shellId, role: "operator" };
    return { role: "operator", director: lock };
  }
  return { role: "viewer" };
}
