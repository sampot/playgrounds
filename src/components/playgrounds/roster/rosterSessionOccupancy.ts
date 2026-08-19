/**
 * Host-authored booth roster snapshot over Roster DataChannel (PG-GO-ROOM-PLAN §7.2).
 * Hub star: Guest↔Guest mesh is postponed, so occupancy cannot ride session_mesh.hello.
 * JSON only — never media bytes.
 */

export const SESSION_OCCUPANCY_TYPE = "session_occupancy" as const;
export const SESSION_OCCUPANCY_VERSION = 1 as const;
export const SESSION_OCCUPANCY_MAX_PEERS = 16;

export type SessionOccupancyPeer = {
  peerId: string;
  name: string;
};

export type SessionOccupancyMessage = {
  type: typeof SESSION_OCCUPANCY_TYPE;
  v: typeof SESSION_OCCUPANCY_VERSION;
  occupants: SessionOccupancyPeer[];
};

const ID_MAX = 128;
const NAME_MAX = 64;

function isPeerId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= ID_MAX;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= NAME_MAX;
}

export function isSessionOccupancyMessage(
  data: unknown
): data is SessionOccupancyMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_OCCUPANCY_TYPE) return false;
  if (m.v !== SESSION_OCCUPANCY_VERSION) return false;
  if (!Array.isArray(m.occupants)) return false;
  if (m.occupants.length > SESSION_OCCUPANCY_MAX_PEERS) return false;
  return m.occupants.every((row) => {
    if (!row || typeof row !== "object") return false;
    const p = row as Record<string, unknown>;
    return isPeerId(p.peerId) && isName(p.name);
  });
}

export function buildSessionOccupancyMessage(opts: {
  occupants: readonly SessionOccupancyPeer[];
}): SessionOccupancyMessage {
  const seen = new Set<string>();
  const occupants: SessionOccupancyPeer[] = [];
  for (const row of opts.occupants) {
    if (!isPeerId(row.peerId) || !isName(row.name) || seen.has(row.peerId)) {
      continue;
    }
    if (occupants.length >= SESSION_OCCUPANCY_MAX_PEERS) break;
    seen.add(row.peerId);
    occupants.push({ peerId: row.peerId, name: row.name });
  }
  return {
    type: SESSION_OCCUPANCY_TYPE,
    v: SESSION_OCCUPANCY_VERSION,
    occupants,
  };
}
