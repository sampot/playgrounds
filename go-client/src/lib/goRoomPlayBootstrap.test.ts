import { describe, expect, it } from "vitest";
import {
  listRoomPlayableCatalogIds,
  ROOM_PLAY_SAM_UPDATE_POLICY,
} from "./goRoomPlayBootstrap";

describe("listRoomPlayableCatalogIds", () => {
  it("includes pg-gomoku among hostable games", () => {
    const ids = listRoomPlayableCatalogIds();
    expect(ids).toContain("pg-gomoku");
  });
});

describe("ROOM_PLAY_SAM_UPDATE_POLICY", () => {
  it("tip-checks so booth play is not stuck on a stale offline pack", () => {
    expect(ROOM_PLAY_SAM_UPDATE_POLICY).toBe("check-tip");
  });
});
