/**
 * Playgrounds shell build stamp — used in the statusbar as a version id
 * (helps tell which deploy/SW cache you’re on).
 *
 * Injected at Vite transform time via `astro.config.ts` `vite.define`.
 */
declare const __PLAYGROUNDS_BUILT_AT__: string | undefined;

export const PLAYGROUNDS_BUILT_AT =
  typeof __PLAYGROUNDS_BUILT_AT__ === "string" ? __PLAYGROUNDS_BUILT_AT__ : "";

/** Compact Taipei wall-clock label for the statusbar. */
export function formatPlaygroundsBuiltAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
