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

  it("in booth, invite cancel only ends play — keeps room open", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkRoomReady();
    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "go-host-1",
      payload: {
        kind: "session_invite_cancel",
        inviteId: "room-play-abc",
        sessionId: "sess-play-1",
      },
    });
    const status = runtime.getStatus();
    expect(status.phase).toBe("ready");
    expect(status.surface).toBe("room");
    expect(status.error).toBeNull();
    expect(status.playCatalogId).toBeNull();
  });

  it("in booth, session.closed only ends play — keeps room open", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkRoomReady();
    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "go-host-1",
      payload: {
        kind: "session_event",
        sessionId: "sess-play-1",
        seq: 1,
        event: { type: "session.closed", reason: "host_closed" },
      },
    });
    const status = runtime.getStatus();
    expect(status.phase).toBe("ready");
    expect(status.surface).toBe("room");
    expect(status.error).toBeNull();
    expect(status.playCatalogId).toBeNull();
  });

  it("in booth, auto-accept play seat keeps phase ready (TV stays mounted)", () => {
    const runtime = createGuestRuntime();
    runtime.__testMarkRoomReady();
    runtime.__testSetRoomHostPeer("host-1");
    const localId = runtime.__testLocalAgentId();
    const applied = runtime.__testApplySessionPlay({
      type: "session_play",
      v: 1,
      op: "offer",
      from: "host-1",
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: localId },
      ],
    });
    expect(applied.ok).toBe(true);
    expect(runtime.getPlayState().seats.some((s) => s.peerId === localId)).toBe(
      true
    );

    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "host-1",
      payload: {
        kind: "session_invite",
        inviteId: "play-inv-1",
        sessionId: "sess-play-1",
        role: "player",
        protocol: {
          protocolId: "gomoku.v1",
          apiVersion: "1",
          roles: ["host", "player"],
        },
      },
    });
    expect(runtime.getStatus().phase).toBe("ready");
    expect(runtime.getStatus().surface).toBe("room");
    expect(runtime.getStatus().playCanvasUrl).toBeTruthy();
  });
});
