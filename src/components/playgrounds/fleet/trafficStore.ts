/**
 * Opt-in mailbox traffic sampling for fleet hot edges (DEC-032 Phase 5).
 * Records enqueue events only (from→to counts); never stores payloads.
 */

import {
  readJson,
  writeJson,
  type RuntimeStorage,
} from "../../../sam-runtime/storage.ts";
import type { FleetEdge } from "./types.ts";

const KEY = "traffic.json";
/** Max distinct directed pairs retained. */
export const TRAFFIC_MAX_PAIRS = 512;
/** Default lookback for edge projection. */
export const TRAFFIC_WINDOW_MS = 15 * 60 * 1000;

export interface TrafficPair {
  from: string;
  to: string;
  count: number;
  lastAt: number;
}

interface TrafficFile {
  pairs: TrafficPair[];
}

function emptyFile(): TrafficFile {
  return { pairs: [] };
}

function pairKey(from: string, to: string): string {
  return `${from}\0${to}`;
}

export class TrafficStore {
  constructor(private storage: RuntimeStorage) {}

  async record(input: {
    from: string;
    to: string;
    at?: number;
  }): Promise<void> {
    const from = input.from?.trim();
    const to = input.to?.trim();
    if (!from || !to) return;
    // Skip pure system→self noise optionally? Keep all for accuracy.
    const at = input.at ?? Date.now();
    const file = await readJson(this.storage, KEY, emptyFile());
    const map = new Map<string, TrafficPair>();
    for (const p of file.pairs ?? []) {
      map.set(pairKey(p.from, p.to), { ...p });
    }
    const k = pairKey(from, to);
    const cur = map.get(k);
    if (cur) {
      cur.count += 1;
      cur.lastAt = at;
    } else {
      map.set(k, { from, to, count: 1, lastAt: at });
    }
    let pairs = [...map.values()].sort((a, b) => b.lastAt - a.lastAt);
    if (pairs.length > TRAFFIC_MAX_PAIRS) {
      pairs = pairs.slice(0, TRAFFIC_MAX_PAIRS);
    }
    await writeJson(this.storage, KEY, { pairs });
  }

  async list(opts?: {
    windowMs?: number;
    now?: number;
  }): Promise<TrafficPair[]> {
    const file = await readJson(this.storage, KEY, emptyFile());
    const windowMs = opts?.windowMs ?? TRAFFIC_WINDOW_MS;
    const now = opts?.now ?? Date.now();
    const cutoff = now - windowMs;
    return (file.pairs ?? [])
      .filter(p => p.lastAt >= cutoff)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  }

  /** Project recent pairs to fleet traffic edges. */
  async toEdges(opts?: {
    windowMs?: number;
    now?: number;
    minCount?: number;
  }): Promise<FleetEdge[]> {
    const minCount = opts?.minCount ?? 1;
    const pairs = await this.list(opts);
    return pairs
      .filter(p => p.count >= minCount)
      .map(p => ({
        from: p.from,
        to: p.to,
        kind: "traffic" as const,
        weight: p.count,
      }));
  }
}
