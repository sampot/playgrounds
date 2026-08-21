import { describe, expect, it } from "vitest";
import {
  assignRoomPlaySeats,
  type RoomPlayOccupant,
} from "./goRoomPlaySeats";

const GOMOKU_ROLES = ["host", "player"] as const;

function occ(
  peerId: string,
  displayName = peerId,
  joinedAt = 0
): RoomPlayOccupant {
  return { peerId, displayName, joinedAt };
}

describe("assignRoomPlaySeats", () => {
  it("auto: host seat → hostPeerId; player → first other by join order", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: [...GOMOKU_ROLES],
      hostPeerId: "host-1",
      occupantsOrdered: [
        occ("host-1", "主持", 1),
        occ("g-b", "乙", 3),
        occ("g-a", "甲", 2),
      ],
      mode: "auto",
    });
    expect(out).toEqual({
      ok: true,
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-a" },
      ],
      spectators: ["g-b"],
    });
  });

  it("auto: not enough guests → ok false with missing roles", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: [...GOMOKU_ROLES],
      hostPeerId: "host-1",
      occupantsOrdered: [occ("host-1")],
      mode: "auto",
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.missingRoles).toEqual(["player"]);
    expect(out.reason).toBe("seats_short");
  });

  it("auto: same displayName on two devices — do not fill both seats by default", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: [...GOMOKU_ROLES],
      hostPeerId: "host-1",
      occupantsOrdered: [
        occ("host-1", "Sam", 1),
        occ("phone", "Sam", 2),
        occ("friend", "友", 3),
      ],
      mode: "auto",
    });
    expect(out).toEqual({
      ok: true,
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "friend" },
      ],
      spectators: ["phone"],
    });
  });

  it("manual: exact picks fill seats", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: [...GOMOKU_ROLES],
      hostPeerId: "host-1",
      occupantsOrdered: [occ("host-1"), occ("g-a"), occ("g-b")],
      mode: "manual",
      manualPicks: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-b" },
      ],
    });
    expect(out).toEqual({
      ok: true,
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-b" },
      ],
      spectators: ["g-a"],
    });
  });

  it("manual: duplicate peerId → fail", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: [...GOMOKU_ROLES],
      hostPeerId: "host-1",
      occupantsOrdered: [occ("host-1"), occ("g-a")],
      mode: "manual",
      manualPicks: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "host-1" },
      ],
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.reason).toBe("duplicate_peer");
  });

  it("manual: missing role or unknown peer → fail", () => {
    expect(
      assignRoomPlaySeats({
        protocolRoles: [...GOMOKU_ROLES],
        hostPeerId: "host-1",
        occupantsOrdered: [occ("host-1"), occ("g-a")],
        mode: "manual",
        manualPicks: [{ role: "host", peerId: "host-1" }],
      }).ok
    ).toBe(false);
    expect(
      assignRoomPlaySeats({
        protocolRoles: [...GOMOKU_ROLES],
        hostPeerId: "host-1",
        occupantsOrdered: [occ("host-1"), occ("g-a")],
        mode: "manual",
        manualPicks: [
          { role: "host", peerId: "host-1" },
          { role: "player", peerId: "ghost" },
        ],
      }).ok
    ).toBe(false);
  });

  it("auto-fills four distinct redpick seats by join order", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: ["host", "p2", "p3", "p4"],
      hostPeerId: "host-1",
      occupantsOrdered: [
        occ("host-1", "H", 0),
        occ("g-a", "A", 1),
        occ("g-b", "B", 2),
        occ("g-c", "C", 3),
        occ("g-d", "D", 4),
      ],
      mode: "auto",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.seats).toEqual([
      { role: "host", peerId: "host-1" },
      { role: "p2", peerId: "g-a" },
      { role: "p3", peerId: "g-b" },
      { role: "p4", peerId: "g-c" },
    ]);
    expect(out.spectators).toEqual(["g-d"]);
  });

  it("respects roleLimits when provided (default 1 each)", () => {
    const out = assignRoomPlaySeats({
      protocolRoles: ["player"],
      roleLimits: { player: 2 },
      hostPeerId: "host-1",
      occupantsOrdered: [
        occ("host-1", "H", 1),
        occ("g-a", "A", 2),
        occ("g-b", "B", 3),
      ],
      mode: "auto",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.seats).toEqual([
      { role: "player", peerId: "host-1" },
      { role: "player", peerId: "g-a" },
    ]);
    expect(out.spectators).toEqual(["g-b"]);
  });
});
