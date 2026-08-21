import { describe, expect, it } from "vitest";
import { listRoomPlayableCatalogIds } from "./goRoomPlayBootstrap";

describe("listRoomPlayableCatalogIds", () => {
  it("includes pg-gomoku among hostable games", () => {
    const ids = listRoomPlayableCatalogIds();
    expect(ids).toContain("pg-gomoku");
  });
});
