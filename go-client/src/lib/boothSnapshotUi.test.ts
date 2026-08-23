import { describe, expect, it } from "vitest";
import {
  boothCastTvLabel,
  boothCastTvOn,
  boothSnapshotToUi,
} from "./boothSnapshotUi";
import type { BoothStateSnapshot } from "@pg/roster/boothChannel";

function snap(
  partial: Partial<BoothStateSnapshot> = {}
): BoothStateSnapshot {
  return {
    sessionId: "sess-1",
    ownerUserId: "u1",
    engineMode: "embedded",
    members: [],
    inviteGate: "none",
    shareFileCount: 0,
    guestCount: 0,
    anchor: "online",
    ...partial,
  };
}

describe("boothSnapshotUi", () => {
  it("maps members and invite gate", () => {
    const ui = boothSnapshotToUi(
      snap({
        guestCount: 2,
        inviteGate: "live",
        inviteShortUrl: "https://go.samkuo.me/i/abc",
        members: [
          {
            peerId: "g-1",
            displayName: "小明",
            kind: "guest",
            isHost: false,
            live: { camera: true, mic: false, display: false },
          },
        ],
      })
    );
    expect(ui.guestCount).toBe(2);
    expect(ui.inviteDoor).toBe("live");
    expect(ui.shortUrl).toBe("https://go.samkuo.me/i/abc");
    expect(ui.occupantPeers).toEqual([{ peerId: "g-1", name: "小明" }]);
    expect(ui.remoteLives).toEqual([
      { peerId: "g-1", camera: true, mic: false },
    ]);
  });

  it("derives TV label from cast summary", () => {
    expect(boothCastTvOn({ kind: "idle" })).toBe(false);
    expect(boothCastTvOn({ kind: "live", label: "鏡頭" })).toBe(true);
    expect(boothCastTvLabel({ kind: "live", label: "鏡頭" })).toBe("鏡頭");
    expect(boothCastTvLabel({ kind: "file", name: "clip.mp4" })).toBe("clip.mp4");
  });
});
