import { describe, expect, it } from "vitest";
import { boothIntentToWire } from "./boothIntentWire";

describe("boothIntentToWire", () => {
  it("maps hub intents to control channel wire types", () => {
    expect(boothIntentToWire({ type: "invite.mint" }, "req-1")).toEqual({
      v: 1,
      id: "req-1",
      type: "booth.intent.invite.mint",
    });
    expect(
      boothIntentToWire({
        type: "cast.offer",
        payload: { kind: "live", peerId: "p1" },
      })
    ).toMatchObject({
      type: "booth.intent.cast.offer",
      payload: { kind: "live", peerId: "p1" },
    });
    expect(boothIntentToWire({ type: "share.rescan" })).toEqual({
      v: 1,
      type: "booth.intent.share.rescan",
    });
  });
});
