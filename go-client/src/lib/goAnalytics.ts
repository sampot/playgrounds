/**
 * Solo `/s/<id>` play analytics (PG-ANALYTICS-PLAN, DEC-053).
 * Events drop to IndexedDB first, then flush to the Platform API via
 * `navigator.sendBeacon` when online. No raw session ids leave the client
 * (the Worker hashes them for DAU dedupe).
 */

import { platformApiOrigin } from "./platformClient";

const IDB_NAME = "go-analytics-v1";
const IDB_STORE = "events";
/** Cap kept on-device (mostly flushed; guards an abuse window). */
const QUEUE_MAX = 500;
/** Retry cadence while online (seconds). */
const FLUSH_INTERVAL_MS = 30_000;

export type GoAnalyticsEvent =
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

export type GoAnalyticsQueued = {
  id: string;
  ts: number;
  e: GoAnalyticsEvent;
};

const SESSION_KEY = "pg_go_analytics_session";
/** Session storage — one contiguous page-session, no cookies, not cross-device. */
export function getAnalyticsSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = `s_${crypto.randomUUID().replace(/-/g, "")}`;
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `s_${crypto.randomUUID().replace(/-/g, "")}`;
  }
}

/** Current visible-time accrual for an ongoing play (closed on end/hidden). */
export type GoPlayTracker = {
  lastVisible: number;
  visibleMs: number;
};

export const ANALYTICS_LISTED: Record<string, boolean> = {};

/** Start a play for a catalog entry; returns a tracker to close + flush on end. */
export async function startGoPlay(
  catalogId: string,
  listed: boolean
): Promise<GoPlayTracker | null> {
  const sessionId = getAnalyticsSessionId();
  ANALYTICS_LISTED[catalogId] = listed;
  await enqueueGoAnalytics({
    event: "play_start",
    catalog_id: catalogId,
    listed,
    session_id: sessionId,
    t0: Date.now(),
  });
  return { lastVisible: Date.now(), visibleMs: 0 };
}

/** Accrue visible time (call on visibilitychange visible; and periodically if needed). */
export function tickGoPlay(tracker: GoPlayTracker): void {
  const now = Date.now();
  if (tracker.lastVisible > 0) {
    const dt = now - tracker.lastVisible;
    if (dt > 0 && dt < 60_000) tracker.visibleMs += dt;
  }
  tracker.lastVisible = now;
}

/** End a play (hidden/unload/swap) and flush queued events best-effort. */
export async function endGoPlay(
  catalogId: string,
  tracker: GoPlayTracker
): Promise<void> {
  tickGoPlay(tracker);
  const sessionId = getAnalyticsSessionId();
  await enqueueGoAnalytics({
    event: "play_end",
    catalog_id: catalogId,
    duration_ms: Math.round(tracker.visibleMs),
    session_id: sessionId,
  });
  await flushGoAnalytics();
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function enqueueGoAnalytics(e: GoAnalyticsEvent): Promise<void> {
  try {
    const row: GoAnalyticsQueued = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      e,
    };
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const countReq = store.count();
      countReq.onerror = () => reject(countReq.error);
      countReq.onsuccess = () => {
        if (countReq.result >= QUEUE_MAX) {
          store.clear();
        }
        store.add(row);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Analytics must never throw into play boot.
  }
}

async function readQueued(limit: number): Promise<GoAnalyticsQueued[]> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const all = (req.result as GoAnalyticsQueued[]) ?? [];
      resolve(all.slice(0, limit));
    };
  });
}

async function removeQueued(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function batchBody(rows: GoAnalyticsQueued[]): string {
  // Only aggregate fields intended for the public face — no raw session id.
  return JSON.stringify({ events: rows.map(r => r.e) });
}

/**
 * Best-effort flush of queued events to `POST /v1/analytics/batch`.
 * sendBeacon survives navigation; straightforward unload-time frees are rare here.
 */
export async function flushGoAnalytics(limit = 100): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.onLine) return 0;
  let rows: GoAnalyticsQueued[] = [];
  try {
    rows = await readQueued(limit);
  } catch {
    return 0;
  }
  if (!rows.length) return 0;
  const sent = navigator.sendBeacon(
    `${platformApiOrigin()}/v1/analytics/batch`,
    new Blob([batchBody(rows)], { type: "application/json" })
  );
  if (!sent) return 0;
  let removed = 0;
  try {
    await removeQueued(rows.map(r => r.id));
    removed = rows.length;
  } catch {
    removed = 0;
  }
  return removed;
}

/** Wire offline/online events + a throttled timer. Returns a stop() function. */
export function startGoAnalyticsFlusher(): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  const kick = () => {
    if (!stopped) void flushGoAnalytics();
  };
  window.addEventListener("online", kick);
  if (timer == null) {
    timer = setInterval(kick, FLUSH_INTERVAL_MS);
  }
  return () => {
    stopped = true;
    window.removeEventListener("online", kick);
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };
}