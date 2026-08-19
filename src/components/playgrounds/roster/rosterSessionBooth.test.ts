import { describe, expect, it } from "vitest";
import {
  SESSION_BOOTH_TYPE,
  buildSessionBoothMessage,
  isSessionBoothMessage,
} from "./rosterSessionBooth";

describe("session_booth", () => {
  it("accepts Host mute／camera_off／kick aimed at one occupant", () => {
    const mute = buildSessionBoothMessage({
      op: "mute",
      from: "host-1",
      to: "g-a",
    });
    expect(isSessionBoothMessage(mute)).toBe(true);
    expect(mute).toEqual({
      type: SESSION_BOOTH_TYPE,
      v: 1,
      op: "mute",
      from: "host-1",
      to: "g-a",
    });
    expect(
      isSessionBoothMessage(
        buildSessionBoothMessage({
          op: "camera_off",
          from: "host-1",
          to: "g-a",
        })
      )
    ).toBe(true);
    expect(
      isSessionBoothMessage(
        buildSessionBoothMessage({ op: "kick", from: "host-1", to: "g-a" })
      )
    ).toBe(true);
  });

  it("rejects camera hang／pull or a message without a target", () => {
    expect(isSessionBoothMessage({ type: "session_camera" })).toBe(false);
    expect(
      isSessionBoothMessage({
        type: SESSION_BOOTH_TYPE,
        v: 1,
        op: "mute",
        from: "host-1",
      })
    ).toBe(false);
  });
});
