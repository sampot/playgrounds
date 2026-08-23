/**
 * Pure BoothAnchor session state (PG-GO-ROOM-ENGINE-PLAN §10).
 */

export const BOOTH_ENGINE_GRACE_MS = 60_000;

export type BoothPresence = "online" | "degraded" | "offline";

export type BoothAnchorRecord = {
  ownerUserId: string;
  boothSessionId: string | null;
  anchorSecretHash: string | null;
  deviceLabel: string | null;
  snapshot: Record<string, unknown> | null;
  guestCount: number;
  engineSocketId: string | null;
  engineConnectedAt: number | null;
  engineDisconnectedAt: number | null;
};

export function createEmptyAnchorRecord(ownerUserId: string): BoothAnchorRecord {
  return {
    ownerUserId,
    boothSessionId: null,
    anchorSecretHash: null,
    deviceLabel: null,
    snapshot: null,
    guestCount: 0,
    engineSocketId: null,
    engineConnectedAt: null,
    engineDisconnectedAt: null,
  };
}

export function ensureAnchorRecord(
  existing: BoothAnchorRecord | null,
  ownerUserId: string
): BoothAnchorRecord {
  return existing ?? createEmptyAnchorRecord(ownerUserId);
}

export function registerAnchorSession(input: {
  rec: BoothAnchorRecord;
  boothSessionId: string;
  anchorSecretHash: string;
  deviceLabel?: string;
  now: number;
  force?: boolean;
}):
  | { ok: true; replaced: boolean }
  | { ok: false; status: number; error: string } {
  const { rec, boothSessionId, anchorSecretHash, deviceLabel, now, force } =
    input;
  const live =
    rec.boothSessionId &&
    rec.engineSocketId &&
    rec.boothSessionId !== boothSessionId;
  if (live && !force) {
    return { ok: false, status: 409, error: "anchor_session_active" };
  }
  const replaced = Boolean(rec.boothSessionId && rec.boothSessionId !== boothSessionId);
  rec.boothSessionId = boothSessionId;
  rec.anchorSecretHash = anchorSecretHash;
  rec.deviceLabel = deviceLabel?.trim() || null;
  rec.engineDisconnectedAt = null;
  if (!rec.engineConnectedAt) rec.engineConnectedAt = now;
  return { ok: true, replaced };
}

/** Lightweight engine liveness — never stores snapshot (§10.4 hibernation). */
export function applyEnginePresence(
  rec: BoothAnchorRecord,
  guestCount: number | undefined,
  now: number
): void {
  if (typeof guestCount === "number") rec.guestCount = guestCount;
  rec.engineDisconnectedAt = null;
  if (!rec.engineConnectedAt) rec.engineConnectedAt = now;
}

/** Cache snapshot when Engine pushes `booth.state.snapshot` (operator on-demand). */
export function cacheEngineSnapshot(
  rec: BoothAnchorRecord,
  snapshot: Record<string, unknown>
): void {
  rec.snapshot = snapshot;
  const guestCount = snapshot.guestCount;
  if (typeof guestCount === "number") rec.guestCount = guestCount;
}

export function markEngineSocket(
  rec: BoothAnchorRecord,
  socketId: string,
  now: number
): void {
  rec.engineSocketId = socketId;
  rec.engineConnectedAt = now;
  rec.engineDisconnectedAt = null;
}

export function clearEngineSocket(rec: BoothAnchorRecord, socketId: string, now: number): void {
  if (rec.engineSocketId !== socketId) return;
  rec.engineSocketId = null;
  rec.engineDisconnectedAt = now;
}

export function revokeAnchor(rec: BoothAnchorRecord, now: number): void {
  rec.boothSessionId = null;
  rec.anchorSecretHash = null;
  rec.deviceLabel = null;
  rec.snapshot = null;
  rec.guestCount = 0;
  rec.engineSocketId = null;
  rec.engineConnectedAt = null;
  rec.engineDisconnectedAt = now;
}

export function enginePresence(
  rec: BoothAnchorRecord,
  now: number,
  graceMs = BOOTH_ENGINE_GRACE_MS
): BoothPresence {
  if (!rec.boothSessionId) return "offline";
  if (rec.engineSocketId) return "online";
  if (
    rec.engineDisconnectedAt &&
    now - rec.engineDisconnectedAt < graceMs
  ) {
    return "degraded";
  }
  return "offline";
}

export type PublicAnchorStatus = {
  online: boolean;
  presence: BoothPresence;
  boothSessionId?: string;
  snapshot?: Record<string, unknown> | null;
  deviceLabel?: string | null;
  guestCount?: number;
};

export function publicAnchorStatus(
  rec: BoothAnchorRecord,
  now: number,
  graceMs = BOOTH_ENGINE_GRACE_MS
): PublicAnchorStatus {
  const presence = enginePresence(rec, now, graceMs);
  const online = presence === "online" || presence === "degraded";
  if (!online || !rec.boothSessionId) {
    return { online: false, presence: "offline" };
  }
  return {
    online: true,
    presence,
    boothSessionId: rec.boothSessionId,
    snapshot: rec.snapshot,
    deviceLabel: rec.deviceLabel,
    guestCount: rec.guestCount,
  };
}

/** Operator remote requires a live Engine WSS, not grace-period degraded. */
export function canMintOperatorCap(status: PublicAnchorStatus): boolean {
  return status.online && status.presence === "online";
}

export function verifyAnchorSecretHash(
  rec: BoothAnchorRecord,
  anchorSecretHash: string
): boolean {
  return Boolean(
    rec.anchorSecretHash &&
      rec.boothSessionId &&
      rec.anchorSecretHash === anchorSecretHash
  );
}
