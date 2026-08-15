/**
 * Format the go-client build timestamp for the home footer version cue.
 */

/** ISO-8601 instant stamped at Vite config load / production build. */
export const GO_BUILD_ISO: string =
  typeof import.meta.env.GO_BUILD_ISO === "string" &&
  import.meta.env.GO_BUILD_ISO
    ? import.meta.env.GO_BUILD_ISO
    : new Date().toISOString();

/**
 * Compact Taipei-local stamp, e.g. `2026-08-15 13:58`.
 * Falls back to the raw ISO string when parsing fails.
 */
export function formatGoBuildStamp(
  iso: string,
  timeZone = "Asia/Taipei"
): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
