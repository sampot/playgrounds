import { describe, expect, it } from "vitest";
import { LOBBY_AD } from "./goLobbyLayout";
import {
  GO_LOBBY_HOTSPOTS,
  getShopHotspot,
  hitTestShopHotspot,
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
  it("omits the decorative wall board from shortcuts", () => {
    expect(GO_LOBBY_HOTSPOTS.map((s) => s.label)).not.toContain("看板");
    expect(hitTestShopHotspot(LOBBY_AD.x + 4, LOBBY_AD.y + 4)).toBeNull();
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
  it("maps help to in-page desk dialogue", () => {
    expect(resolveShopHotspotAction("help")).toEqual({
      type: "open-help-desk",
    });
  });

  it("maps cabinet to in-scene overlay", () => {
    expect(resolveShopHotspotAction("cabinet")).toEqual({
      type: "open-cabinets",
    });
  });
});
