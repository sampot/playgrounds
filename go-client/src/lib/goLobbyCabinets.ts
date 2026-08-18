import { LOBBY_CABINETS, type LobbyRect } from "./goLobbyLayout";
import { pointInRect, distanceToRect } from "./goShopHotspots";

export const LOBBY_CABINET_SESSION_KEY = "pg_go_lobby_cabinets";

export type LobbyCabinetGame = { id: string; title: string };

export type LobbyCabinetStore = {
  ids: string[];
  day: string | null;
};

export function lobbyDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLobbyCabinetIds(raw: string | null): string[] {
  return parseLobbyCabinetStore(raw).ids;
}

export function parseLobbyCabinetStore(raw: string | null): LobbyCabinetStore {
  if (!raw) return { ids: [], day: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        ids: parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
        day: null,
      };
    }
    if (parsed && typeof parsed === "object") {
      const rec = parsed as { ids?: unknown; day?: unknown };
      const ids = Array.isArray(rec.ids)
        ? rec.ids.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
      const day = typeof rec.day === "string" && rec.day.length > 0 ? rec.day : null;
      return { ids, day };
    }
  } catch {
    /* ignore */
  }
  return { ids: [], day: null };
}

export function resolveLobbyCabinetGames<T extends LobbyCabinetGame>(args: {
  storedIds: readonly string[];
  listed: readonly T[];
  pick: (limit: number) => T[];
  count?: number;
  storedDay?: string | null;
  today?: string;
  force?: boolean;
}): T[] {
  const count = args.count ?? LOBBY_CABINETS.length;
  if (args.force) return args.pick(count).slice(0, count);
  if (args.today && args.storedDay && args.storedDay !== args.today) {
    return args.pick(count).slice(0, count);
  }
  const byId = new Map(args.listed.map((g) => [g.id, g]));
  const kept = args.storedIds
    .map((id) => byId.get(id))
    .filter((g): g is T => Boolean(g));
  if (kept.length >= count) return kept.slice(0, count);
  return args.pick(count).slice(0, count);
}

export function cabinetStandPoint(
  index: number,
  cabinets: readonly LobbyRect[] = LOBBY_CABINETS
): { x: number; y: number } {
  const r = cabinets[index] ?? cabinets[0]!;
  return { x: r.x + r.w / 2, y: r.y + r.h + 10 };
}

export function hitTestLobbyCabinetIndex(
  worldX: number,
  worldY: number,
  cabinets: readonly LobbyRect[] = LOBBY_CABINETS
): number | null {
  for (let i = 0; i < cabinets.length; i += 1) {
    if (pointInRect(worldX, worldY, cabinets[i]!)) return i;
  }
  return null;
}

export function nearestLobbyCabinetIndex(
  worldX: number,
  worldY: number,
  cabinets: readonly LobbyRect[] = LOBBY_CABINETS
): number | null {
  if (cabinets.length === 0) return null;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < cabinets.length; i += 1) {
    const d = distanceToRect(worldX, worldY, cabinets[i]!);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export type CabinetHotspotAction =
  | { type: "play-cabinet"; catalogId: string }
  | { type: "open-cabinets" };

export function resolveCabinetHotspotAction(args: {
  cabinetIndex: number | null;
  games: readonly LobbyCabinetGame[];
}): CabinetHotspotAction {
  if (args.cabinetIndex == null) return { type: "open-cabinets" };
  const game = args.games[args.cabinetIndex];
  if (!game) return { type: "open-cabinets" };
  return { type: "play-cabinet", catalogId: game.id };
}

export function readLobbyCabinetStore(
  storage: Pick<Storage, "getItem"> | null | undefined
): LobbyCabinetStore {
  if (!storage) return { ids: [], day: null };
  return parseLobbyCabinetStore(storage.getItem(LOBBY_CABINET_SESSION_KEY));
}

export function readLobbyCabinetIds(
  storage: Pick<Storage, "getItem"> | null | undefined
): string[] {
  return readLobbyCabinetStore(storage).ids;
}

export function writeLobbyCabinetIds(
  storage: Pick<Storage, "setItem">,
  ids: readonly string[],
  day: string = lobbyDayKey()
): void {
  storage.setItem(
    LOBBY_CABINET_SESSION_KEY,
    JSON.stringify({ ids, day })
  );
}

export function resolveCabinetOverlayRecs<T extends LobbyCabinetGame>(args: {
  floorGames: readonly T[];
  query: string;
  search: (q: string, limit: number) => T[];
  searchLimit?: number;
}): { recs: T[]; isSearching: boolean } {
  const query = args.query.trim();
  if (!query) return { recs: [...args.floorGames], isSearching: false };
  return {
    recs: args.search(query, args.searchLimit ?? 3),
    isSearching: true,
  };
}

export const LOBBY_RETURN_STAND_KEY = "pg_go_lobby_return_stand";

export function writeLobbyReturnStand(
  storage: Pick<Storage, "setItem">,
  pos: { x: number; y: number }
): void {
  storage.setItem(LOBBY_RETURN_STAND_KEY, JSON.stringify(pos));
}

export function consumeLobbyReturnStand(
  storage: Pick<Storage, "getItem" | "removeItem"> | null | undefined
): { x: number; y: number } | null {
  if (!storage) return null;
  const raw = storage.getItem(LOBBY_RETURN_STAND_KEY);
  storage.removeItem(LOBBY_RETURN_STAND_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { x?: unknown }).x === "number" &&
      typeof (parsed as { y?: unknown }).y === "number"
    ) {
      return { x: (parsed as { x: number }).x, y: (parsed as { y: number }).y };
    }
  } catch {
    /* ignore */
  }
  return null;
}
