import { describe, expect, it } from "vitest";
import {
  SESSION_PLAY_TYPE,
  buildSessionPlayEnd,
  buildSessionPlayOffer,
  isSessionPlayMessage,
  type SessionPlaySeat,
} from "./rosterSessionPlay";

describe("session_play", () => {
  const seats: SessionPlaySeat[] = [
    { role: "host", peerId: "host-1" },
    { role: "player", peerId: "g-a" },
  ];

  it("accepts offer with catalogId and seats", () => {
    const offer = buildSessionPlayOffer({
      from: "host-1",
      catalogId: "pg-gomoku",
      seats,
    });
    expect(isSessionPlayMessage(offer)).toBe(true);
    expect(offer).toMatchObject({
      type: SESSION_PLAY_TYPE,
      op: "offer",
      from: "host-1",
      catalogId: "pg-gomoku",
      seats,
    });
  });

  it("accepts offer with optional rev", () => {
    const offer = buildSessionPlayOffer({
      from: "host-1",
      catalogId: "pg-gomoku",
      rev: "abc123",
      seats,
    });
    expect(isSessionPlayMessage(offer)).toBe(true);
    expect(offer.rev).toBe("abc123");
  });

  it("accepts end from host", () => {
    const end = buildSessionPlayEnd({ from: "host-1" });
    expect(isSessionPlayMessage(end)).toBe(true);
    expect(end).toMatchObject({
      type: SESSION_PLAY_TYPE,
      op: "end",
      from: "host-1",
    });
  });

  it("rejects offer missing catalogId or seats", () => {
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        seats,
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        catalogId: "pg-gomoku",
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        catalogId: "pg-gomoku",
        seats: [],
      })
    ).toBe(false);
  });

  it("rejects seat with empty role or peerId, or duplicate peerId", () => {
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        catalogId: "pg-gomoku",
        seats: [{ role: "", peerId: "g-a" }],
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        catalogId: "pg-gomoku",
        seats: [{ role: "player", peerId: "" }],
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "host-1",
        catalogId: "pg-gomoku",
        seats: [
          { role: "host", peerId: "same" },
          { role: "player", peerId: "same" },
        ],
      })
    ).toBe(false);
  });

  it("rejects end without from, and unknown ops", () => {
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "end",
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "start",
        from: "host-1",
      })
    ).toBe(false);
  });

  it("rejects wrong type／version", () => {
    expect(
      isSessionPlayMessage({
        type: "session_cast",
        v: 1,
        op: "end",
        from: "host-1",
      })
    ).toBe(false);
    expect(
      isSessionPlayMessage({
        type: SESSION_PLAY_TYPE,
        v: 2,
        op: "end",
        from: "host-1",
      })
    ).toBe(false);
  });
});
