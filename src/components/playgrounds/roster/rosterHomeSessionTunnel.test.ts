import { describe, expect, it } from "vitest";
import { SessionBridgeError } from "../sessionBridge";
import { createRosterSessionWatchBridge } from "./rosterHomeSessionTunnel";

describe("createRosterSessionWatchBridge", () => {
  it("exposes event channel and rejects act", async () => {
    const bridge = createRosterSessionWatchBridge({
      sessionId: "sess-1",
      channelName: "playgrounds-session:sess-1",
      homeSandboxId: "go-guest-watch",
    });
    expect(await bridge.getEventChannel()).toEqual({
      name: "playgrounds-session:sess-1",
    });
    const seat = await bridge.getSeat();
    expect(seat).toMatchObject({
      sessionId: "sess-1",
      seatId: "spectator",
      role: "spectator",
      participantId: "go-guest-watch",
      ready: false,
    });
    expect(await bridge.getState()).toMatchObject({
      channelName: "playgrounds-session:sess-1",
      status: "waiting",
    });
    await expect(bridge.act({ type: "place" })).rejects.toBeInstanceOf(
      SessionBridgeError
    );
    try {
      await bridge.act({ type: "place" });
    } catch (e) {
      expect(e).toMatchObject({ code: "forbidden" });
    }
  });
});
