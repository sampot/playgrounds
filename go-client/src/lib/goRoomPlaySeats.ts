/**
 * Booth play seat assignment (PG-GO-ROOM-PLAY-PLAN §8).
 * Pure — no WebRTC／UI.
 */

export type RoomPlayOccupant = {
  peerId: string;
  displayName: string;
  /** Join order key; lower = earlier. */
  joinedAt: number;
};

export type RoomPlaySeatPick = {
  role: string;
  peerId: string;
};

export type AssignRoomPlaySeatsOk = {
  ok: true;
  seats: RoomPlaySeatPick[];
  spectators: string[];
};

export type AssignRoomPlaySeatsFail = {
  ok: false;
  reason:
    | "seats_short"
    | "duplicate_peer"
    | "unknown_peer"
    | "role_mismatch"
    | "empty_roles";
  missingRoles?: string[];
};

export type AssignRoomPlaySeatsResult =
  | AssignRoomPlaySeatsOk
  | AssignRoomPlaySeatsFail;

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function seatSlots(
  protocolRoles: readonly string[],
  roleLimits?: Readonly<Record<string, number>>
): string[] {
  const slots: string[] = [];
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
    for (let i = 0; i < n; i++) slots.push(r);
  }
  return slots;
}

function sortedOccupants(
  occupants: readonly RoomPlayOccupant[]
): RoomPlayOccupant[] {
  return [...occupants].sort((a, b) => {
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.peerId.localeCompare(b.peerId);
  });
}

export function assignRoomPlaySeats(opts: {
  protocolRoles: readonly string[];
  roleLimits?: Readonly<Record<string, number>>;
  hostPeerId: string;
  occupantsOrdered: readonly RoomPlayOccupant[];
  mode: "auto" | "manual";
  manualPicks?: readonly RoomPlaySeatPick[];
}): AssignRoomPlaySeatsResult {
  const slots = seatSlots(opts.protocolRoles, opts.roleLimits);
  if (slots.length === 0) {
    return { ok: false, reason: "empty_roles" };
  }

  const byId = new Map(
    opts.occupantsOrdered.map((o) => [o.peerId, o] as const)
  );
  if (!byId.has(opts.hostPeerId)) {
    return {
      ok: false,
      reason: "unknown_peer",
      missingRoles: slots.includes("host") ? ["host"] : [slots[0]!],
    };
  }

  if (opts.mode === "manual") {
    const picks = opts.manualPicks ?? [];
    if (picks.length !== slots.length) {
      const have = new Map<string, number>();
      for (const p of picks) {
        have.set(p.role, (have.get(p.role) ?? 0) + 1);
      }
      const need = new Map<string, number>();
      for (const r of slots) need.set(r, (need.get(r) ?? 0) + 1);
      const missing: string[] = [];
      for (const [role, n] of need) {
        const got = have.get(role) ?? 0;
        for (let i = got; i < n; i++) missing.push(role);
      }
      return {
        ok: false,
        reason: "seats_short",
        missingRoles: missing.length ? missing : [...need.keys()],
      };
    }
    const seen = new Set<string>();
    const seats: RoomPlaySeatPick[] = [];
    const needCounts = new Map<string, number>();
    for (const r of slots) needCounts.set(r, (needCounts.get(r) ?? 0) + 1);
    const gotCounts = new Map<string, number>();
    for (const p of picks) {
      if (!byId.has(p.peerId)) {
        return { ok: false, reason: "unknown_peer" };
      }
      if (seen.has(p.peerId)) {
        return { ok: false, reason: "duplicate_peer" };
      }
      seen.add(p.peerId);
      const need = needCounts.get(p.role) ?? 0;
      const got = gotCounts.get(p.role) ?? 0;
      if (got >= need) {
        return { ok: false, reason: "role_mismatch" };
      }
      gotCounts.set(p.role, got + 1);
      seats.push({ role: p.role, peerId: p.peerId });
    }
    for (const [role, n] of needCounts) {
      if ((gotCounts.get(role) ?? 0) !== n) {
        return { ok: false, reason: "role_mismatch", missingRoles: [role] };
      }
    }
    const spectators = opts.occupantsOrdered
      .map((o) => o.peerId)
      .filter((id) => !seen.has(id));
    return { ok: true, seats, spectators };
  }

  // auto
  const ordered = sortedOccupants(opts.occupantsOrdered);
  const seated = new Set<string>();
  const seatedNames = new Set<string>();
  const seats: RoomPlaySeatPick[] = [];
  const missing: string[] = [];

  for (const role of slots) {
    let pick: RoomPlayOccupant | undefined;
    if (role === "host" && !seated.has(opts.hostPeerId)) {
      pick = byId.get(opts.hostPeerId);
    } else {
      for (const o of ordered) {
        if (seated.has(o.peerId)) continue;
        const n = normName(o.displayName);
        if (n && seatedNames.has(n)) continue;
        pick = o;
        break;
      }
    }
    if (!pick) {
      missing.push(role);
      continue;
    }
    seated.add(pick.peerId);
    const n = normName(pick.displayName);
    if (n) seatedNames.add(n);
    seats.push({ role, peerId: pick.peerId });
  }

  if (missing.length) {
    return { ok: false, reason: "seats_short", missingRoles: missing };
  }

  const spectators = ordered
    .map((o) => o.peerId)
    .filter((id) => !seated.has(id));
  return { ok: true, seats, spectators };
}
