import { describe, expect, it } from "vitest";
import {
  expandRoomPlaySeatSlots,
  formatRoomPlaySeatFail,
  roomPlayRoleLabel,
  roomPlaySeatDraftToPicks,
  roomPlaySeatDraftComplete,
} from "./goRoomPlaySeatDraft";

describe("roomPlayRoleLabel", () => {
  it("maps known roles to short Chinese labels", () => {
    expect(roomPlayRoleLabel("host")).toBe("主持");
    expect(roomPlayRoleLabel("player")).toBe("對手");
    expect(roomPlayRoleLabel("p2")).toBe("二家");
    expect(roomPlayRoleLabel("mystery")).toBe("mystery");
  });
});

describe("expandRoomPlaySeatSlots", () => {
  it("expands roles with optional limits into ordered slots", () => {
    expect(expandRoomPlaySeatSlots(["host", "player"])).toEqual([
      { index: 0, role: "host", label: "主持" },
      { index: 1, role: "player", label: "對手" },
    ]);
    expect(
      expandRoomPlaySeatSlots(["host", "p2"], { p2: 2 })
    ).toEqual([
      { index: 0, role: "host", label: "主持" },
      { index: 1, role: "p2", label: "二家" },
      { index: 2, role: "p2", label: "二家" },
    ]);
  });
});

describe("roomPlaySeatDraftToPicks", () => {
  it("returns null when any seat is empty or length mismatches", () => {
    const slots = expandRoomPlaySeatSlots(["host", "player"]);
    expect(roomPlaySeatDraftToPicks(slots, ["h", null])).toBeNull();
    expect(roomPlaySeatDraftToPicks(slots, ["h"])).toBeNull();
  });

  it("maps filled peer ids to seat picks", () => {
    const slots = expandRoomPlaySeatSlots(["host", "player"]);
    expect(roomPlaySeatDraftToPicks(slots, ["h", "g"])).toEqual([
      { role: "host", peerId: "h" },
      { role: "player", peerId: "g" },
    ]);
  });
});

describe("roomPlaySeatDraftComplete", () => {
  it("is true only when every slot has a peer", () => {
    const slots = expandRoomPlaySeatSlots(["host", "player"]);
    expect(roomPlaySeatDraftComplete(slots, ["h", "g"])).toBe(true);
    expect(roomPlaySeatDraftComplete(slots, ["h", ""])).toBe(false);
  });
});

describe("formatRoomPlaySeatFail", () => {
  it("explains short seats with missing roles", () => {
    expect(
      formatRoomPlaySeatFail("seats_short", ["player"])
    ).toMatch(/對手|player|缺席|不夠/);
  });

  it("explains duplicate and unknown peers", () => {
    expect(formatRoomPlaySeatFail("duplicate_peer")).toMatch(/同一人/);
    expect(formatRoomPlaySeatFail("unknown_peer")).toMatch(/不在場/);
  });
});
