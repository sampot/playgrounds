import { describe, expect, it } from "vitest";
import { LOBBY_AD, LOBBY_CHAT } from "./goLobbyLayout";
import {
  GO_LOBBY_HOTSPOTS,
  getShopHotspot,
  hitTestShopHotspot,
  lobbyPromptHotspot,
  nearestShopHotspotInRange,
  resolveShopHotspotAction,
  shouldShowGoLobby,
} from "./goShopHotspots";

describe("shouldShowGoLobby", () => {
  it("shows on home when not playing", () => {
    expect(shouldShowGoLobby({ pathname: "/", canvasActive: false })).toBe(true);
  });

  it("hides when canvas is active", () => {
    expect(shouldShowGoLobby({ pathname: "/", canvasActive: true })).toBe(false);
  });

  it("hides on invite and share routes", () => {
    expect(
      shouldShowGoLobby({ pathname: "/i/abc", canvasActive: false })
    ).toBe(false);
    expect(
      shouldShowGoLobby({ pathname: "/s/pg-gomoku", canvasActive: false })
    ).toBe(false);
  });
});

describe("hitTestShopHotspot", () => {
  it("returns boss when clicking service counter", () => {
    const boss = getShopHotspot("boss")!;
    expect(
      hitTestShopHotspot(boss.x + 4, boss.y + 4, GO_LOBBY_HOTSPOTS)
    ).toBe("boss");
  });

  it("returns null on empty floor", () => {
    expect(hitTestShopHotspot(280, 180, GO_LOBBY_HOTSPOTS)).toBeNull();
  });
});

describe("GO_LOBBY_HOTSPOTS", () => {
  it("maps PLAY neon to an sfx toggle, not a decorative board", () => {
    expect(GO_LOBBY_HOTSPOTS.map((s) => s.label)).not.toContain("看板");
    expect(hitTestShopHotspot(LOBBY_AD.x + 4, LOBBY_AD.y + 4)).toBe("sfx");
    expect(getShopHotspot("sfx")?.label).toBe("音效");
    expect(resolveShopHotspotAction("sfx")).toEqual({ type: "toggle-sfx" });
  });
});

describe("nearestShopHotspotInRange", () => {
  it("finds cabinet when avatar stands near a machine", () => {
    const cabinet = getShopHotspot("cabinet")!;
    const id = nearestShopHotspotInRange(
      cabinet.x + 14,
      cabinet.y + cabinet.h + 8,
      28,
      GO_LOBBY_HOTSPOTS
    );
    expect(id).toBe("cabinet");
  });

  it("finds furniture when standing just outside the south face", () => {
    const boss = getShopHotspot("boss")!;
    expect(
      nearestShopHotspotInRange(boss.x + boss.w / 2, boss.y + boss.h + 10)
    ).toBe("boss");
    const cabinet = getShopHotspot("cabinet")!;
    expect(
      nearestShopHotspotInRange(
        cabinet.x + 14,
        cabinet.y + cabinet.h + 10
      )
    ).toBe("cabinet");
  });

  it("does not prompt from the entrance aisle", () => {
    expect(nearestShopHotspotInRange(160, 168)).toBeNull();
  });
});

describe("resolveShopHotspotAction", () => {
  it("maps cabinet to in-scene overlay", () => {
    expect(resolveShopHotspotAction("cabinet")).toEqual({
      type: "open-cabinets",
    });
  });

  it("maps 包廂 lounge to /room", () => {
    expect(hitTestShopHotspot(LOBBY_CHAT.x + 8, LOBBY_CHAT.y + 8)).toBe("room");
    expect(getShopHotspot("room")?.label).toBe("包廂");
    expect(resolveShopHotspotAction("room")).toEqual({
      type: "navigate",
      href: "/room",
    });
  });
});

describe("lobbyPromptHotspot", () => {
  it("uses hover when pointing, otherwise the nearest furniture", () => {
    const boss = getShopHotspot("boss")!;
    const nearBoss = {
      x: boss.x + boss.w / 2,
      y: boss.y + boss.h + 10,
    };
    expect(
      lobbyPromptHotspot({
        avatar: nearBoss,
        hover: "sfx",
      })
    ).toBe("sfx");
    expect(
      lobbyPromptHotspot({
        avatar: nearBoss,
        hover: null,
      })
    ).toBe("boss");
    expect(
      lobbyPromptHotspot({
        avatar: { x: 160, y: 168 },
        hover: null,
      })
    ).toBeNull();
  });
});
