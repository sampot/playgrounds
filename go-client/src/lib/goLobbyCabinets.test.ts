import { describe, expect, it } from "vitest";
import { LOBBY_CABINETS } from "./goLobbyLayout";
import {
  cabinetStandPoint,
  consumeLobbyReturnStand,
  hitTestLobbyCabinetIndex,
  lobbyDayKey,
  nearestLobbyCabinetIndex,
  nearLobbyCabinetIndex,
  parseLobbyCabinetIds,
  parseLobbyCabinetStore,
  resolveCabinetHotspotAction,
  resolveCabinetOverlayRecs,
  resolveLobbyCabinetGames,
  writeLobbyReturnStand,
} from "./goLobbyCabinets";

const games = [
  { id: "pg-a", title: "A" },
  { id: "pg-b", title: "B" },
  { id: "pg-c", title: "C" },
  { id: "pg-d", title: "D" },
  { id: "pg-e", title: "E" },
];

describe("parseLobbyCabinetIds", () => {
  it("reads a string array of ids", () => {
    expect(parseLobbyCabinetIds(JSON.stringify(["pg-a", "pg-b"]))).toEqual([
      "pg-a",
      "pg-b",
    ]);
    expect(parseLobbyCabinetIds("nope")).toEqual([]);
  });
});

describe("parseLobbyCabinetStore", () => {
  it("reads the object store and a legacy id array", () => {
    expect(
      parseLobbyCabinetStore(JSON.stringify({ ids: ["pg-a"], day: "2026-08-18" }))
    ).toEqual({ ids: ["pg-a"], day: "2026-08-18" });
    expect(parseLobbyCabinetStore(JSON.stringify(["pg-a", "pg-b"]))).toEqual({
      ids: ["pg-a", "pg-b"],
      day: null,
    });
  });
});

describe("resolveLobbyCabinetGames", () => {
  it("keeps stored ids that are still listed", () => {
    const picked: string[] = [];
    const result = resolveLobbyCabinetGames({
      storedIds: ["pg-b", "pg-c", "pg-d", "pg-e"],
      listed: games,
      pick: (limit) => {
        picked.push(String(limit));
        return games.slice(0, limit);
      },
      count: 4,
    });
    expect(result.map((g) => g.id)).toEqual(["pg-b", "pg-c", "pg-d", "pg-e"]);
    expect(picked).toEqual([]);
  });

  it("repicks when stored ids are missing or short", () => {
    const result = resolveLobbyCabinetGames({
      storedIds: ["gone", "pg-a"],
      listed: games,
      pick: (limit) => games.slice(0, limit),
      count: 4,
    });
    expect(result.map((g) => g.id)).toEqual(["pg-a", "pg-b", "pg-c", "pg-d"]);
  });

  it("repicks on a new day or when forced", () => {
    const fresh = resolveLobbyCabinetGames({
      storedIds: ["pg-b", "pg-c", "pg-d", "pg-e"],
      storedDay: "2026-08-17",
      today: "2026-08-18",
      listed: games,
      pick: (limit) => games.slice(0, limit),
      count: 4,
    });
    expect(fresh.map((g) => g.id)).toEqual(["pg-a", "pg-b", "pg-c", "pg-d"]);
    const forced = resolveLobbyCabinetGames({
      storedIds: ["pg-b", "pg-c", "pg-d", "pg-e"],
      storedDay: "2026-08-18",
      today: "2026-08-18",
      listed: games,
      pick: (limit) => games.slice(0, limit),
      count: 4,
      force: true,
    });
    expect(forced.map((g) => g.id)).toEqual(["pg-a", "pg-b", "pg-c", "pg-d"]);
  });
});

describe("cabinetStandPoint", () => {
  it("stands on the south face of the machine", () => {
    const cab = LOBBY_CABINETS[1]!;
    const stand = cabinetStandPoint(1);
    expect(stand.x).toBe(cab.x + cab.w / 2);
    expect(stand.y).toBe(cab.y + cab.h + 10);
  });
});

describe("lobbyDayKey", () => {
  it("uses the local calendar day", () => {
    expect(lobbyDayKey(new Date(2026, 7, 18))).toBe("2026-08-18");
  });
});

describe("hitTestLobbyCabinetIndex", () => {
  it("returns the machine index for a point on that cabinet", () => {
    const cab = LOBBY_CABINETS[2]!;
    expect(hitTestLobbyCabinetIndex(cab.x + 2, cab.y + 2)).toBe(2);
    expect(hitTestLobbyCabinetIndex(160, 168)).toBeNull();
  });
});

describe("nearestLobbyCabinetIndex", () => {
  it("finds the closest machine from the south face", () => {
    const cab = LOBBY_CABINETS[0]!;
    expect(nearestLobbyCabinetIndex(cab.x + cab.w / 2, cab.y + cab.h + 8)).toBe(
      0
    );
  });
});

describe("nearLobbyCabinetIndex", () => {
  it("only counts a machine the avatar is standing by", () => {
    const cab = LOBBY_CABINETS[0]!;
    expect(nearLobbyCabinetIndex(cab.x + cab.w / 2, cab.y + cab.h + 8)).toBe(0);
    expect(nearLobbyCabinetIndex(160, 168)).toBeNull();
  });
});

describe("resolveCabinetOverlayRecs", () => {
  it("defaults to the floor four and searches the catalog", () => {
    expect(
      resolveCabinetOverlayRecs({
        floorGames: games.slice(0, 4),
        query: "",
        search: () => games.slice(4),
      })
    ).toEqual({ recs: games.slice(0, 4), isSearching: false });
    expect(
      resolveCabinetOverlayRecs({
        floorGames: games.slice(0, 4),
        query: "e",
        search: (q) => games.filter((g) => g.id.includes(q)),
      })
    ).toEqual({ recs: [{ id: "pg-e", title: "E" }], isSearching: true });
  });
});

describe("lobby return stand", () => {
  it("consumes a one-shot stand after playing a cabinet", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    writeLobbyReturnStand(storage, { x: 30, y: 150 });
    expect(consumeLobbyReturnStand(storage)).toEqual({ x: 30, y: 150 });
    expect(consumeLobbyReturnStand(storage)).toBeNull();
  });
});

describe("resolveCabinetHotspotAction", () => {
  it("plays the assigned game when a cabinet index is known", () => {
    expect(
      resolveCabinetHotspotAction({
        cabinetIndex: 1,
        games,
      })
    ).toEqual({ type: "play-cabinet", catalogId: "pg-b" });
  });

  it("opens the list when the index is missing", () => {
    expect(
      resolveCabinetHotspotAction({
        cabinetIndex: null,
        games,
      })
    ).toEqual({ type: "open-cabinets" });
  });
});
