/**
 * Play analytics aggregation (PG-ANALYTICS-PLAN / DEC-053).
 * Stores **only aggregates** in KV — session ids arrive hashed, raw events never
 * persisted. DAU = daily deduplicated sessions that played at least once
 * (listed & unlisted alike).
 */

import type { EnvStore } from "./auth.js";

export type AnalyticsEventWire =
  | {
      event: "play_start";
      catalog_id: string;
      listed: boolean;
      session_id: string;
      t0: number;
    }
  | {
      event: "play_end";
      catalog_id: string;
      duration_ms: number;
      session_id: string;
    };

export type GameTotalAgg = {
  playStarts: number;
  playEnds: number;
  sessionSeconds: number;
  /** Hashed sessions that ever played (any day) — listed & unlisted. */
  sessions: Record<string, true>;
};

export type GameDayAgg = GameTotalAgg & {
  /** Hashed sessions active on that day (DAU population). */
  day: string;
};

/** Fast non-cryptographic hash — sufficient for dedupe-only, ids are random. */
function hashSessionId(id: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < id.length; i++) {
    const ch = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16).padStart(8, "0");
}

const TOTAL_KEY = (catalogId: string) => `analytics:byGameTotal:${catalogId}`;
const DAY_KEY = (day: string, catalogId: string) =>
  `analytics:byGameDay:${day}:${catalogId}`;

function emptyAgg(): GameTotalAgg {
  return { playStarts: 0, playEnds: 0, sessionSeconds: 0, sessions: {} };
}

function clampCatalogId(id: string): string | null {
  const c = typeof id === "string" ? id.trim() : "";
  if (!c || c.length > 48 || !/^[A-Za-z0-9._-]+$/.test(c)) return null;
  return c;
}

function clampDurationMs(d: unknown): number | null {
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0 || n > 48 * 60 * 60 * 1000) return null;
  return Math.round(n);
}

/** Local date string (YYYY-MM-DD) in the Worker's timezone. */
export function dayKey(ts = Date.now()): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function readAgg<T extends GameTotalAgg>(store: EnvStore, key: string): Promise<T | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeAgg(store: EnvStore, key: string, agg: GameTotalAgg): Promise<void> {
  await store.put(key, JSON.stringify(agg));
}

function applyEvent(
  agg: GameTotalAgg,
  e: AnalyticsEventWire,
  sessionHash: string
): void {
  if (e.event === "play_start") {
    agg.playStarts += 1;
    agg.sessions[sessionHash] = true;
  } else {
    const d = clampDurationMs(e.duration_ms);
    if (d == null) return;
    agg.playEnds += 1;
    agg.sessionSeconds = Math.round(agg.sessionSeconds * 1000 + d) / 1000;
  }
}

export async function appendAnalyticsBatch(
  store: EnvStore,
  events: unknown
): Promise<{ accepted: number; rejected: number }> {
  const raw = Array.isArray(events) ? (events as unknown[]) : [];
  if (!raw.length) return { accepted: 0, rejected: 0 };

  // Aggregate per day+catalog first (few KV round-trips).
  const byDay = new Map<string, Map<string, GameTotalAgg>>();
  const hashOf = new Map<string, string>();
  let accepted = 0;
  let rejected = 0;

  for (const r of raw) {
    const e = r as Partial<AnalyticsEventWire>;
    const catalogId = clampCatalogId(e.catalog_id as string);
    if (!catalogId) {
      rejected += 1;
      continue;
    }
    if (e.event !== "play_start" && e.event !== "play_end") {
      rejected += 1;
      continue;
    }
    if (typeof e.session_id !== "string" || !e.session_id) {
      rejected += 1;
      continue;
    }
    if (e.event === "play_end" && clampDurationMs(e.duration_ms) == null) {
      rejected += 1;
      continue;
    }
    accepted += 1;
    let hash = hashOf.get(e.session_id);
    if (!hash) {
      hash = hashSessionId(e.session_id);
      hashOf.set(e.session_id, hash);
    }
    const day = dayKey((e as AnalyticsEventWire & { t0?: number }).t0 ?? Date.now());
    let perDay = byDay.get(day);
    if (!perDay) {
      perDay = new Map();
      byDay.set(day, perDay);
    }
    let agg = perDay.get(catalogId);
    if (!agg) {
      agg = emptyAgg();
      perDay.set(catalogId, agg);
    }
    applyEvent(agg, e as AnalyticsEventWire, hash);
  }

  // Persist — total merge + per-day merge. Sessions merged so DAU survives replays.
  for (const [day, perDay] of byDay) {
    for (const [catalogId, incoming] of perDay) {
      const dayKeyStr = DAY_KEY(day, catalogId);
      let dayAgg = await readAgg<GameDayAgg>(store, dayKeyStr);
      if (!dayAgg) dayAgg = { ...emptyAgg(), day };
      dayAgg.playStarts += incoming.playStarts;
      dayAgg.playEnds += incoming.playEnds;
      dayAgg.sessionSeconds += incoming.sessionSeconds;
      for (const [h] of Object.entries(incoming.sessions)) dayAgg.sessions[h] = true;
      await writeAgg(store, dayKeyStr, dayAgg);

      const totalKey = TOTAL_KEY(catalogId);
      let total = await readAgg<GameTotalAgg>(store, totalKey);
      if (!total) total = emptyAgg();
      total.playStarts += incoming.playStarts;
      total.playEnds += incoming.playEnds;
      total.sessionSeconds += incoming.sessionSeconds;
      for (const [h] of Object.entries(incoming.sessions)) total.sessions[h] = true;
      await writeAgg(store, totalKey, total);
    }
  }

  return { accepted, rejected };
}

export type AnalyticsGamesRow = {
  catalog_id: string;
  listed: boolean;
  plays: number;
  unique_sessions: number;
  avg_duration_sec: number;
};

/** All-time totals table for the dash. */
export async function listAnalyticsGames(
  store: EnvStore,
  isListed: (catalogId: string) => boolean
): Promise<AnalyticsGamesRow[]> {
  if (!store.list) return [];
  const { keys: allKeys } = await store.list({ prefix: "analytics:byGameTotal:" });
  const ids = new Set<string>();
  for (const item of allKeys) {
    const id = item.name.slice("analytics:byGameTotal:".length);
    ids.add(id);
  }
  const rows: AnalyticsGamesRow[] = [];
  for (const id of ids) {
    const total = await readAgg<GameTotalAgg>(store, TOTAL_KEY(id));
    if (!total || total.playStarts <= 0) continue;
    rows.push({
      catalog_id: id,
      listed: isListed(id),
      plays: total.playStarts,
      unique_sessions: Object.keys(total.sessions).length,
      avg_duration_sec:
        total.playEnds > 0 ? Math.round(total.sessionSeconds / total.playEnds) : 0,
    });
  }
  return rows.sort((a, b) => b.plays - a.plays);
}

export type AnalyticsDayRow = AnalyticsGamesRow & {
  day: string;
  dauc: number;
};

/**
 * Recent N days per game: plays / unique sessions / avg duration / DAU count.
 * A game with zero plays on a day simply has no row.
 */
export async function listAnalyticsDays(
  store: EnvStore,
  days: number,
  isListed: (catalogId: string) => boolean
): Promise<AnalyticsDayRow[]> {
  if (!store.list) return [];
  const out: AnalyticsDayRow[] = [];
  const dayList: string[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) dayList.push(dayKey(now - i * 86_400_000));
  for (const day of dayList) {
    const { keys: dayKeys } = await store.list({
      prefix: `analytics:byGameDay:${day}:`,
    });
    for (const item of dayKeys) {
      const catalogId = item.name.slice(`analytics:byGameDay:${day}:`.length);
      const agg = await readAgg<GameDayAgg>(store, item.name);
      if (!agg || agg.playStarts <= 0) continue;
      out.push({
        day,
        catalog_id: catalogId,
        listed: isListed(catalogId),
        plays: agg.playStarts,
        unique_sessions: Object.keys(agg.sessions).length,
        avg_duration_sec:
          agg.playEnds > 0 ? Math.round(agg.sessionSeconds / agg.playEnds) : 0,
        dauc: Object.keys(agg.sessions).length,
      });
    }
  }
  return out.sort((a, b) => (a.day === b.day ? b.plays - a.plays : a.day.localeCompare(b.day)));
}