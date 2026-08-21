import { describe, expect, it } from "vitest";
import {
  listRoomPlayableCatalogIds,
  listRoomPlayableGames,
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
});

describe("ROOM_PLAY_SAM_UPDATE_POLICY", () => {
  it("tip-checks so booth play is not stuck on a stale offline pack", () => {
    expect(ROOM_PLAY_SAM_UPDATE_POLICY).toBe("check-tip");
  });
});
