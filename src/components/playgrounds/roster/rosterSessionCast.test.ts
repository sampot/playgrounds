import { describe, expect, it } from "vitest";
import {
  SESSION_CAST_TYPE,
  buildSessionCastMessage,
  isSessionCastMessage,
} from "./rosterSessionCast";

describe("session_cast", () => {
  it("accepts start／stop／state from a named peer", () => {
    const start = buildSessionCastMessage({
      op: "start",
      from: "host-1",
      kind: "video",
      name: "clip.mp4",
    });
    expect(isSessionCastMessage(start)).toBe(true);
    expect(start).toMatchObject({
      type: SESSION_CAST_TYPE,
      op: "start",
      kind: "video",
      name: "clip.mp4",
    });
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({ op: "stop", from: "host-1" })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "state",
          from: "host-1",
          paused: true,
          t: 12.5,
        })
      )
    ).toBe(true);
  });

  it("rejects chat, missing from, or a start without kind", () => {
    expect(isSessionCastMessage({ type: "session_chat" })).toBe(false);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "start",
        from: "h",
      })
    ).toBe(false);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "stop",
      })
    ).toBe(false);
  });
});
