/**
 * Persist the Host's live 包廂 invite door across refresh (sessionStorage).
 * TTL timer is re-armed from `expiresAt` on restore.
 */

import { isInviteUnexpired } from "./hostRuntime";

export const GO_ROOM_INVITE_SESSION_KEY = "pg_go_room_invite_door";

export type RoomInviteSessionSnapshot = {
  inviteId: string;
  shortUrl: string;
  expiresAt: number;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function parseSnapshot(raw: string): RoomInviteSessionSnapshot | null {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const inviteId =
      typeof data.inviteId === "string" ? data.inviteId.trim() : "";
    const shortUrl =
      typeof data.shortUrl === "string" ? data.shortUrl.trim() : "";
    const expiresAt =
      typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt)
        ? data.expiresAt
        : NaN;
    if (!inviteId || !shortUrl || !Number.isFinite(expiresAt)) return null;
    return { inviteId, shortUrl, expiresAt };
  } catch {
    return null;
  }
}

/** Live door only; drops corrupt／expired rows. */
export function readRoomInviteSession(
  store: Store | null | undefined,
  now = Date.now()
): RoomInviteSessionSnapshot | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(GO_ROOM_INVITE_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const snap = parseSnapshot(raw);
  if (!snap || !isInviteUnexpired(snap.expiresAt, now)) {
    clearRoomInviteSession(store);
    return null;
  }
  return snap;
}

export function writeRoomInviteSession(
  store: Store | null | undefined,
  snap: RoomInviteSessionSnapshot
): void {
  if (!store) return;
  const inviteId = snap.inviteId.trim();
  const shortUrl = snap.shortUrl.trim();
  if (
    !inviteId ||
    !shortUrl ||
    !Number.isFinite(snap.expiresAt) ||
    !isInviteUnexpired(snap.expiresAt)
  ) {
    return;
  }
  try {
    store.setItem(
      GO_ROOM_INVITE_SESSION_KEY,
      JSON.stringify({
        inviteId,
        shortUrl,
        expiresAt: snap.expiresAt,
      })
    );
  } catch {
    /* private mode／quota */
  }
}

export function clearRoomInviteSession(
  store: Store | null | undefined
): void {
  if (!store) return;
  try {
    store.removeItem(GO_ROOM_INVITE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
