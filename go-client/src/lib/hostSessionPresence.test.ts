import { describe, expect, it } from "vitest";
import { buildHostSessionPresenceBody } from "./hostSessionPresence";

describe("buildHostSessionPresenceBody", () => {
  it("includes host + guest display names and seatedRoles for the SAM", () => {
    const body = buildHostSessionPresenceBody({
      hostRole: "host",
      hostDisplayName: "山姆鍋（Sam)",
      seats: [
        {
          seatId: "seat-a",
          role: "p2",
          peerId: "g-a",
          displayName: "G1",
        },
        {
          seatId: "seat-b",
          role: "p3",
          peerId: "g-b",
          displayName: "G2",
        },
      ],
    });
    expect(body.playerSeated).toBe(true);
    expect(body.seatedRoles).toEqual(["host", "p2", "p3"]);
    expect(body.seats).toEqual([
      { role: "host", displayName: "山姆鍋（Sam)" },
      {
        seatId: "seat-a",
        role: "p2",
        peerId: "g-a",
        displayName: "G1",
      },
      {
        seatId: "seat-b",
        role: "p3",
        peerId: "g-b",
        displayName: "G2",
      },
    ]);
  });

  it("still lists host when no guests are seated yet", () => {
    const body = buildHostSessionPresenceBody({
      hostRole: "host",
      hostDisplayName: "主持甲",
      seats: [],
      playerSeated: true,
    });
    expect(body.seatedRoles).toEqual(["host"]);
    expect(body.seats).toEqual([
      { role: "host", displayName: "主持甲" },
    ]);
  });
});
