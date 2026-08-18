import { describe, expect, it } from "vitest";
import {
  SESSION_CAMERA_TYPE,
  buildSessionCameraMessage,
  isSessionCameraMessage,
} from "./rosterSessionCamera";

describe("session_camera", () => {
  it("accepts offer／request／release like file hang／pull", () => {
    const offer = buildSessionCameraMessage({ op: "offer", from: "host-1" });
    expect(isSessionCameraMessage(offer)).toBe(true);
    expect(offer).toEqual({
      type: SESSION_CAMERA_TYPE,
      v: 1,
      op: "offer",
      from: "host-1",
    });
    expect(
      isSessionCameraMessage(
        buildSessionCameraMessage({ op: "request", from: "g-a" })
      )
    ).toBe(true);
    expect(
      isSessionCameraMessage(
        buildSessionCameraMessage({ op: "release", from: "g-a" })
      )
    ).toBe(true);
    expect(
      isSessionCameraMessage(
        buildSessionCameraMessage({ op: "unoffer", from: "host-1" })
      )
    ).toBe(true);
  });

  it("rejects cast, chat, or a message without from", () => {
    expect(isSessionCameraMessage({ type: "session_cast" })).toBe(false);
    expect(
      isSessionCameraMessage({
        type: SESSION_CAMERA_TYPE,
        v: 1,
        op: "offer",
      })
    ).toBe(false);
  });
});
