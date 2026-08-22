/**
 * Booth play seat-draft helpers for Host picker (手動指定席).
 * Pure — validates shape for UI; authority still assignRoomPlaySeats.
 */

import type { AssignRoomPlaySeatsFail } from "./goRoomPlaySeats";
import type { RoomPlaySeatPick } from "./goRoomPlaySeats";

export type RoomPlaySeatSlot = {
  index: number;
  role: string;
  label: string;
};

/** Short Chinese label for protocol role ids. */
export function roomPlayRoleLabel(role: string): string {
  const r = role.trim();
  switch (r) {
    case "host":
      return "主持";
    case "player":
      return "對手";
    case "p2":
      return "二家";
    case "p3":
      return "三家";
    case "p4":
      return "四家";
    default:
      return r || "席";
  }
}

/** Expand protocol roles (+ optional limits) into ordered seat slots. */
export function expandRoomPlaySeatSlots(
  protocolRoles: readonly string[],
  roleLimits?: Readonly<Record<string, number>>
): RoomPlaySeatSlot[] {
  const slots: RoomPlaySeatSlot[] = [];
  const seen = new Set<string>();
  for (const role of protocolRoles) {
    const r = role.trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    const lim = roleLimits?.[r];
    const n =
      typeof lim === "number" && Number.isFinite(lim) && lim > 0
        ? Math.floor(lim)
        : 1;
    for (let i = 0; i < n; i++) {
      slots.push({
        index: slots.length,
        role: r,
        label: roomPlayRoleLabel(r),
      });
    }
  }
  return slots;
}

export function roomPlaySeatDraftComplete(
  slots: readonly RoomPlaySeatSlot[],
  peerIds: readonly (string | null | undefined)[]
): boolean {
  if (peerIds.length !== slots.length) return false;
  return peerIds.every((id) => typeof id === "string" && id.trim().length > 0);
}

/** Map draft peer ids → wire picks; null if incomplete. */
export function roomPlaySeatDraftToPicks(
  slots: readonly RoomPlaySeatSlot[],
  peerIds: readonly (string | null | undefined)[]
): RoomPlaySeatPick[] | null {
  if (!roomPlaySeatDraftComplete(slots, peerIds)) return null;
  return slots.map((s, i) => ({
    role: s.role,
    peerId: String(peerIds[i]).trim(),
  }));
}

export function formatRoomPlaySeatFail(
  reason: AssignRoomPlaySeatsFail["reason"] | string,
  missingRoles?: readonly string[]
): string {
  switch (reason) {
    case "seats_short": {
      const labels = (missingRoles ?? [])
        .map((r) => roomPlayRoleLabel(r))
        .filter(Boolean);
      if (labels.length) {
        return `還缺席：${labels.join("、")}。請指定或請人進來。`;
      }
      return "人數不夠開局，請指定席次或請人進來";
    }
    case "duplicate_peer":
      return "同一人不能佔兩席";
    case "unknown_peer":
      return "指定的人不在場";
    case "role_mismatch":
      return "席次與遊戲角色不符";
    case "empty_roles":
      return "這款遊戲沒有可開的席次";
    case "not_playable":
      return "這款遊戲目前不能在包廂開";
    default:
      return "無法開局，請再試一次";
  }
}
