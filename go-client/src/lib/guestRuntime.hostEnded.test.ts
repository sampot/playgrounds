// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createGuestRuntime } from "./guestRuntime";

describe("guestRuntime host-ended notification", () => {
  it("marks ended when Host cancels the session invite", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkConnected();
    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "go-host-1",
      payload: {
        kind: "session_invite_cancel",
        inviteId: "inv-1",
        sessionId: "sess-1",
      },
    });
    const status = runtime.getStatus();
    expect(status.phase).toBe("ended");
    expect(status.error).toMatch(/主持|結束/);
  });

  it("marks ended when the peer channel closes after seating", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkConnected();
    runtime.__testOnChannelClose();
    const status = runtime.getStatus();
    expect(status.phase).toBe("ended");
    expect(status.error).toMatch(/主持|結束|連線/);
  });

  it("marks ended when receiving session.closed event relay", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkConnected();
    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "go-host-1",
      payload: {
        kind: "session_event",
        sessionId: "sess-1",
        seq: 1,
        event: { type: "session.closed", reason: "host_closed" },
      },
    });
    const status = runtime.getStatus();
    expect(status.phase).toBe("ended");
    expect(status.error).toBe("主持已結束這一場");
  });
});
