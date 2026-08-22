// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { createGuestRuntime } from "./guestRuntime";

describe("guestRuntime booth spectator event sync", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("binds watch channel from enriched offer so session_event fans out", async () => {
    vi.useFakeTimers();
    const opened: string[] = [];
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        name: string;
        constructor(name: string) {
          this.name = name;
          opened.push(name);
        }
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      }
    );

    const runtime = createGuestRuntime();
    runtime.__testMarkRoomReady();
    runtime.__testSetRoomHostPeer("host-1");
    const localId = runtime.__testLocalAgentId();

    // Spectator: local peer not in seats; offer carries session channel.
    runtime.__testHandleSessionPlay({
      type: "session_play",
      v: 1,
      op: "offer",
      from: "host-1",
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "other-guest" },
      ],
      sessionId: "sess-play-watch",
      channelName: "playgrounds-session:sess-play-watch",
    });

    expect(runtime.getPlayState().seats.some((s) => s.peerId === localId)).toBe(
      false
    );
    expect(runtime.__testHasTunnelChannel("sess-play-watch")).toBe(true);

    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "host-1",
      payload: {
        kind: "session_event",
        sessionId: "sess-play-watch",
        seq: 2,
        event: { type: "match.placed", x: 7, y: 7 },
      },
    });

    // Queued while spectator remount settles, then flushed.
    await vi.advanceTimersByTimeAsync(500);
    expect(opened).toContain("playgrounds-session:sess-play-watch");
  });

  it("late-binds spectator from first session_event when offer lacked channel", async () => {
    vi.useFakeTimers();
    const opened: string[] = [];
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        name: string;
        constructor(name: string) {
          this.name = name;
          opened.push(name);
        }
        postMessage() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
      }
    );

    const runtime = createGuestRuntime();
    runtime.__testMarkRoomReady();
    runtime.__testSetRoomHostPeer("host-1");

    runtime.__testHandleSessionPlay({
      type: "session_play",
      v: 1,
      op: "offer",
      from: "host-1",
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "other-guest" },
      ],
    });
    expect(runtime.__testHasTunnelChannel("sess-late")).toBe(false);

    runtime.__testOnRelay({
      type: "avatar_relay",
      from: "host-1",
      payload: {
        kind: "session_event",
        sessionId: "sess-late",
        seq: 1,
        event: { type: "match.started", firstRole: "host" },
      },
    });
    expect(runtime.__testHasTunnelChannel("sess-late")).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(opened).toContain("playgrounds-session:sess-late");
  });
});
