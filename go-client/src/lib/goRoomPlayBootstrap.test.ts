import { describe, expect, it } from "vitest";
import {
  listRoomPlayableCatalogIds,
  listRoomPlayableGames,
  roomPlayPickerBlurb,
  ROOM_PLAY_SAM_UPDATE_POLICY,
} from "./goRoomPlayBootstrap";

describe("listRoomPlayableCatalogIds", () => {
  it("includes pg-gomoku among hostable games", () => {
    const ids = listRoomPlayableCatalogIds();
    expect(ids).toContain("pg-gomoku");
  });

  it("includes pg-redpick (redpick.v1 four seats)", () => {
    const ids = listRoomPlayableCatalogIds();
    expect(ids).toContain("pg-redpick");
  });
});

describe("listRoomPlayableGames", () => {
  it("exposes title and seat counts for the play picker", () => {
    const games = listRoomPlayableGames();
    const gomoku = games.find((g) => g.catalogId === "pg-gomoku");
    const redpick = games.find((g) => g.catalogId === "pg-redpick");
    expect(gomoku?.title).toBeTruthy();
    expect(gomoku?.seatCount).toBe(2);
    expect(redpick?.title).toMatch(/撿紅點/);
    expect(redpick?.seatCount).toBe(4);
  });

  it("does not surface wire protocol ids in picker blurbs", () => {
    const games = listRoomPlayableGames();
    for (const g of games) {
      expect(g.blurb).not.toMatch(/[a-z0-9-]+\.v\d+/i);
    }
  });
});

describe("roomPlayPickerBlurb", () => {
  it("strips parenthetical protocol ids from catalog blurbs", () => {
    expect(
      roomPlayPickerBlurb(
        "15×15 雙人／人機／AI 對 AI；可邀請遠端對手（gomoku.v1）。"
      )
    ).toBe("15×15 雙人／人機／AI 對 AI；可邀請遠端對手。");
    expect(
      roomPlayPickerBlurb(
        "對點數撿牌，連撿／清桌加成；四人人機或包廂四人連線（redpick.v1）。"
      )
    ).toBe("對點數撿牌，連撿／清桌加成；四人人機或包廂四人連線。");
    expect(roomPlayPickerBlurb("plain blurb")).toBe("plain blurb");
  });
});

describe("ROOM_PLAY_SAM_UPDATE_POLICY", () => {
  it("tip-checks so booth play is not stuck on a stale offline pack", () => {
    expect(ROOM_PLAY_SAM_UPDATE_POLICY).toBe("check-tip");
  });
});
