/**
 * Client-side paging for go `/apps` offline list (max 10 per page).
 * Ad mid-split is computed on the **current page slice**, not the full list.
 */

export const APPS_PAGE_SIZE = 10;

/** How many pages for `total` items (0 items → 0 pages). */
export function appsPageCount(
  total: number,
  pageSize: number = APPS_PAGE_SIZE
): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.ceil(total / pageSize);
}

/** Clamp 1-based page into `[1, pageCount]` (empty → 1). */
export function clampAppsPage(
  page: number,
  pageCount: number
): number {
  if (!Number.isFinite(page) || page < 1) return 1;
  if (pageCount <= 0) return 1;
  return Math.min(Math.floor(page), pageCount);
}

/** Parse `?page=` query; invalid → 1. */
export function parseAppsPageParam(raw: string | null | undefined): number {
  if (raw == null || raw === "") return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

/** Slice of items for 1-based `page`. */
export function appsPageSlice<T>(
  items: readonly T[],
  page: number,
  pageSize: number = APPS_PAGE_SIZE
): T[] {
  const count = appsPageCount(items.length, pageSize);
  const p = clampAppsPage(page, count);
  if (count === 0) return [];
  const start = (p - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/**
 * Insert house banner after this many rows of the **current page**.
 * Same rule as PG-GO-ADS-PLAN §5.1.1: floor(n/2); n<2 → after all.
 */
export function appsAdSplit(pageLength: number): number {
  if (pageLength < 2) return pageLength;
  return Math.floor(pageLength / 2);
}
