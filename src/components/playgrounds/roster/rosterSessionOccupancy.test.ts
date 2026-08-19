import { describe, expect, it } from "vitest";
import {
  SESSION_OCCUPANCY_TYPE,
  buildSessionOccupancyMessage,
  isSessionOccupancyMessage,
} from "./rosterSessionOccupancy";

describe("session_occupancy", () => {
  it("accepts a Host snapshot that lists everyone in the booth", () => {
    const msg = buildSessionOccupancyMessage({
      occupants: [
        { peerId: "host-1", name: "太郎" },
        { peerId: "g-a", name: "甲" },
        { peerId: "g-b", name: "乙" },
      ],
    });
    expect(msg).toEqual({
      type: SESSION_OCCUPANCY_TYPE,
      v: 1,
      occupants: [
        { peerId: "host-1", name: "太郎" },
        { peerId: "g-a", name: "甲" },
        { peerId: "g-b", name: "乙" },
      ],
    });
    expect(isSessionOccupancyMessage(msg)).toBe(true);
  });

  it("rejects chat, missing occupants, or a row without a name", () => {
    expect(isSessionOccupancyMessage({ type: "session_chat" })).toBe(false);
    expect(
      isSessionOccupancyMessage({
        type: SESSION_OCCUPANCY_TYPE,
        v: 1,
      })
    ).toBe(false);
    expect(
      isSessionOccupancyMessage({
        type: SESSION_OCCUPANCY_TYPE,
        v: 1,
        occupants: [{ peerId: "g-a" }],
      })
    ).toBe(false);
  });

  it("drops duplicate peerIds so the snapshot stays one row per person", () => {
    const msg = buildSessionOccupancyMessage({
      occupants: [
        { peerId: "g-a", name: "甲" },
        { peerId: "g-a", name: "甲2" },
        { peerId: "g-b", name: "乙" },
      ],
    });
    expect(msg.occupants).toEqual([
      { peerId: "g-a", name: "甲" },
      { peerId: "g-b", name: "乙" },
    ]);
  });
});
