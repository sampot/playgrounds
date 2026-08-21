import { describe, expect, it } from "vitest";
import {
  SESSION_CAST_TYPE,
  buildSessionCastMessage,
  isSessionCastMessage,
} from "./rosterSessionCast";

describe("session_cast", () => {
  it("accepts offer／request／release like file hang／pull", () => {
    const offer = buildSessionCastMessage({
      op: "offer",
      from: "host-1",
      kind: "video",
      name: "clip.mp4",
    });
    expect(isSessionCastMessage(offer)).toBe(true);
    expect(offer).toMatchObject({
      type: SESSION_CAST_TYPE,
      op: "offer",
      kind: "video",
      name: "clip.mp4",
    });
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "request",
          from: "g-a",
          id: "file-1",
        })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({ op: "release", from: "g-a" })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({ op: "unoffer", from: "host-1" })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "reject",
          from: "host-1",
          id: "file-1",
        })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "reject",
          from: "g-a",
          id: "file-1",
          reason: "這個瀏覽器當不了大螢幕片源",
        })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "offer",
          from: "host-1",
          kind: "video",
          name: "clip.mp4",
          id: "file-1",
          fromPeer: "g-a",
        })
      )
    ).toBe(true);
  });

  it("rejects offer with empty fromPeer", () => {
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        kind: "video",
        fromPeer: "",
      })
    ).toBe(false);
  });

  it("accepts private scope on offer and rejects unknown scope", () => {
    const privateOffer = buildSessionCastMessage({
      op: "offer",
      from: "host-1",
      kind: "video",
      name: "secret.mp4",
      id: "pvt_abc",
      scope: "private",
    });
    expect(isSessionCastMessage(privateOffer)).toBe(true);
    expect(privateOffer.scope).toBe("private");
    expect(
      isSessionCastMessage(
        buildSessionCastMessage({
          op: "offer",
          from: "host-1",
          kind: "audio",
          id: "file-1",
          scope: "share",
        })
      )
    ).toBe(true);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        kind: "video",
        scope: "cloud",
      })
    ).toBe(false);
  });

  it("rejects chat, missing from, start／stop, or an offer without kind", () => {
    expect(isSessionCastMessage({ type: "session_chat" })).toBe(false);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "offer",
        from: "h",
      })
    ).toBe(false);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "start",
        from: "h",
        kind: "video",
      })
    ).toBe(false);
    expect(
      isSessionCastMessage({
        type: SESSION_CAST_TYPE,
        v: 1,
        op: "unoffer",
      })
    ).toBe(false);
  });
});
