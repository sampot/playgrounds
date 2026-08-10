import { describe, expect, it } from "vitest";
import {
  appendAnalyticsBatch,
  dayKey,
  listAnalyticsDays,
  listAnalyticsGames,
  type AnalyticsEventWire,
} from "./analytics.js";

function memoryStore(): {
  storage: Map<string, string>;
  store: {
    get: (k: string) => Promise<string | null>;
    put: (k: string, v: string) => Promise<void>;
    delete: (k: string) => Promise<void>;
    list: (o: { prefix: string }) => Promise<{ keys: { name: string }[] }>;
  };
} {
  const m = new Map<string, string>();
  return {
    storage: m,
    store: {
      get: async (k) => m.get(k) ?? null,
      put: async (k, v) => {
        m.set(k, v);
      },
      delete: async (k) => {
        m.delete(k);
      },
      list: async (o) => ({
        keys: [...m.keys()].filter((k) => k.startsWith(o.prefix)).map((name) => ({ name })),
      }),
    },
  };
}

const listed = () => true;
const onlyPgRubik = (id: string) => id === "pg-rubik";

describe("analytics aggregation", () => {
  it("counts plays and visible duration and dedupes sessions per day", async () => {
    const { store } = memoryStore();
    const events: AnalyticsEventWire[] = [
      { event: "play_start", catalog_id: "pg-rubik", listed: true, session_id: "s_aaa", t0: Date.now() },
      { event: "play_start", catalog_id: "pg-rubik", listed: true, session_id: "s_aaa", t0: Date.now() },
      { event: "play_start", catalog_id: "pg-rubik", listed: true, session_id: "s_bbb", t0: Date.now() },
      { event: "play_end", catalog_id: "pg-rubik", duration_ms: 5000, session_id: "s_aaa" },
      { event: "play_end", catalog_id: "pg-rubik", duration_ms: 1500, session_id: "s_bbb" },
    ];
    const r = await appendAnalyticsBatch(store, events);
    expect(r.accepted).toBe(5);
    expect(r.rejected).toBe(0);

    const games = await listAnalyticsGames(store, listed);
    expect(games).toHaveLength(1);
    expect(games[0]?.plays).toBe(3);
    // Same-day dedupe: two sessions → DAU/unique = 2, not 3.
    expect(games[0]?.unique_sessions).toBe(2);
    // avg = (5000 + 1500) / 2 sec = 3 (rounded).
    expect(games[0]?.avg_duration_sec).toBe(3);
  });

  it("marks unlisted via the callback and prunes malformed events", async () => {
    const { store } = memoryStore();
    const events = [
      { event: "play_start", catalog_id: "pg-mystery", listed: false, session_id: "s_x", t0: Date.now() },
      { event: "play_start", catalog_id: "bad id!", listed: true, session_id: "s_x", t0: Date.now() },
      { event: "play_stanza", catalog_id: "pg-rubik", listed: true, session_id: "s_x" },
      { event: "play_end", catalog_id: "pg-rubik", duration_ms: 999999999, session_id: "s_x" },
    ];
    const r = await appendAnalyticsBatch(store, events);
    expect(r.accepted).toBe(1);
    expect(r.rejected).toBe(3);

    const games = await listAnalyticsGames(store, onlyPgRubik);
    expect(games).toHaveLength(1);
    expect(games[0]?.catalog_id).toBe("pg-mystery");
    expect(games[0]?.listed).toBe(false);
  });

  it("returns per-day DAU counts", async () => {
    const { store } = memoryStore();
    const t = Date.now();
    await appendAnalyticsBatch(store, [
      { event: "play_start", catalog_id: "pg-rubik", listed: true, session_id: "s_a", t0: t },
      { event: "play_start", catalog_id: "pg-rubik", listed: true, session_id: "s_b", t0: t },
    ]);
    const days = await listAnalyticsDays(store, 30, listed);
    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe(dayKey(t));
    expect(days[0]?.dauc).toBe(2);
    expect(days[0]?.plays).toBe(2);
  });
});
