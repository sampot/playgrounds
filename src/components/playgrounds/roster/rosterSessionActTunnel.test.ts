import { describe, expect, it, vi } from "vitest";
import { SessionBridgeError } from "../sessionBridge";
import {
  SESSION_ACT_KIND,
  SESSION_ACT_RESULT_KIND,
  SESSION_EVENT_KIND,
  SESSION_SEAT_BOUND_KIND,
  isSessionActPayload,
  isSessionActResultPayload,
  isSessionEventRelayPayload,
  isSessionSeatBoundPayload,
} from "./rosterSessionBridge";
import {
  buildSessionActResultPayload,
  clearSessionActPendingForTests,
  requestSessionActOverRelay,
  resolveSessionActResult,
} from "./rosterSessionActTunnel";

describe("session tunnel payload guards", () => {
  it("accepts seat_bound／act／result／event", () => {
    expect(
      isSessionSeatBoundPayload({
        kind: SESSION_SEAT_BOUND_KIND,
        inviteId: "i",
        sessionId: "s",
        seatId: "seat",
        role: "participant",
        channelName: "playgrounds-session:s",
      })
    ).toBe(true);
    expect(
      isSessionActPayload({
        kind: SESSION_ACT_KIND,
        inviteId: "i",
        sessionId: "s",
        seatId: "seat",
        requestId: "r1",
        payload: { text: "hi" },
      })
    ).toBe(true);
    expect(
      isSessionActResultPayload({
        kind: SESSION_ACT_RESULT_KIND,
        requestId: "r1",
        sessionId: "s",
        ok: true,
        result: { ok: true },
      })
    ).toBe(true);
    expect(
      isSessionEventRelayPayload({
        kind: SESSION_EVENT_KIND,
        sessionId: "s",
        seq: 3,
        event: { type: "item_added" },
      })
    ).toBe(true);
  });
});

describe("requestSessionActOverRelay", () => {
  it("resolves when matching result arrives", async () => {
    clearSessionActPendingForTests();
    const send = vi.fn((act: { requestId: string }) => {
      resolveSessionActResult(
        buildSessionActResultPayload({
          requestId: act.requestId,
          sessionId: "s",
          ok: true,
          result: { ok: true, echo: 1 },
        })
      );
    });
    const result = await requestSessionActOverRelay({
      inviteId: "i",
      sessionId: "s",
      seatId: "seat",
      payload: { text: "hi" },
      send: send as never,
      requestId: "fixed-req",
    });
    expect(result).toEqual({ ok: true, echo: 1 });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: SESSION_ACT_KIND,
        requestId: "fixed-req",
      }),
      undefined
    );
  });

  it("rejects on error result", async () => {
    clearSessionActPendingForTests();
    const send = vi.fn((act: { requestId: string }) => {
      resolveSessionActResult(
        buildSessionActResultPayload({
          requestId: act.requestId,
          sessionId: "s",
          ok: false,
          error: { code: "act_rejected", message: "nope" },
        })
      );
    });
    await expect(
      requestSessionActOverRelay({
        inviteId: "i",
        sessionId: "s",
        seatId: "seat",
        payload: {},
        send: send as never,
        requestId: "err-req",
      })
    ).rejects.toMatchObject({
      code: "act_rejected",
      message: "nope",
    } satisfies Partial<SessionBridgeError>);
  });

  it("rejects on timeout", async () => {
    clearSessionActPendingForTests();
    vi.useFakeTimers();
    try {
      const p = requestSessionActOverRelay({
        inviteId: "i",
        sessionId: "s",
        seatId: "seat",
        payload: {},
        send: () => {},
        requestId: "timeout-req",
        timeoutMs: 50,
      });
      const assertion = expect(p).rejects.toMatchObject({
        code: "timeout",
      } satisfies Partial<SessionBridgeError>);
      await vi.advanceTimersByTimeAsync(60);
      await assertion;
    } finally {
      clearSessionActPendingForTests();
      vi.useRealTimers();
    }
  });
});
