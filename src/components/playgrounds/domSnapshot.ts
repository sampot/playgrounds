/**
 * Truncate / normalize DOM snapshot text returned from the work canvas (Phase 6).
 */

export const DOM_SNAPSHOT_DEFAULT_MAX = 8_000;
export const DOM_SNAPSHOT_HARD_MAX = 50_000;
export const DOM_SNAPSHOT_HARD_MIN = 256;

export function clampDomSnapshotMaxChars(maxChars?: number): number {
  const n =
    maxChars === undefined || !Number.isFinite(maxChars)
      ? DOM_SNAPSHOT_DEFAULT_MAX
      : Math.floor(maxChars);
  return Math.min(Math.max(n, DOM_SNAPSHOT_HARD_MIN), DOM_SNAPSHOT_HARD_MAX);
}

export function truncateDomSnapshot(
  text: string,
  maxChars?: number
): { text: string; truncated: boolean } {
  const max = clampDomSnapshotMaxChars(maxChars);
  const raw = text ?? "";
  if (raw.length <= max) {
    return { text: raw, truncated: false };
  }
  return {
    text: `${raw.slice(0, max)}…[truncated]`,
    truncated: true,
  };
}
