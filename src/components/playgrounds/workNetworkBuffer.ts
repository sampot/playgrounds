/**
 * Ring buffer for work-project canvas same-origin fetch summaries (Phase 6).
 * Shell is authoritative; canvas only posts events.
 */

export interface WorkNetworkEntry {
  /** Monotonic index for since-cursor reads. */
  index: number;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  durationMs: number;
  error?: string;
  /** Response Content-Type if known (no body). */
  contentType?: string;
  at: number;
}

const DEFAULT_MAX = 200;

let nextIndex = 0;
let maxEntries = DEFAULT_MAX;
let entries: WorkNetworkEntry[] = [];

export function configureWorkNetworkBuffer(max = DEFAULT_MAX): void {
  maxEntries = Math.max(1, max);
  if (entries.length > maxEntries) {
    entries = entries.slice(-maxEntries);
  }
}

export function clearWorkNetworkBuffer(): void {
  entries = [];
}

export function appendWorkNetworkEntry(
  partial: Omit<WorkNetworkEntry, "index" | "at"> & { at?: number }
): WorkNetworkEntry {
  const entry: WorkNetworkEntry = {
    index: nextIndex++,
    method: partial.method || "GET",
    url: partial.url,
    status: partial.status,
    ok: partial.ok,
    durationMs: partial.durationMs,
    error: partial.error,
    contentType: partial.contentType,
    at: partial.at ?? Date.now(),
  };
  entries.push(entry);
  if (entries.length > maxEntries) {
    entries = entries.slice(-maxEntries);
  }
  return entry;
}

export function listWorkNetworkEntries(since?: number): WorkNetworkEntry[] {
  if (since === undefined || since < 0) {
    return entries.slice();
  }
  return entries.filter(e => e.index > since);
}

export function workNetworkBufferSize(): number {
  return entries.length;
}

/** Test helper: reset indices and contents. */
export function resetWorkNetworkBufferForTests(): void {
  nextIndex = 0;
  entries = [];
  maxEntries = DEFAULT_MAX;
}
