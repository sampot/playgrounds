/**
 * Pure helpers for the Playgrounds Console panel UI.
 */

export type ConsoleLevelFilter = "all" | "debug" | "info" | "warn" | "error";

export interface ConsoleLineView {
  level: string;
  text: string;
  at: number;
}

export const CONSOLE_LEVEL_FILTERS: ConsoleLevelFilter[] = [
  "all",
  "debug",
  "info",
  "warn",
  "error",
];

export function normalizeConsoleLevel(level: string): string {
  const l = level.toLowerCase();
  // console.log shares the info bucket (no separate LOG filter).
  if (l === "log") return "info";
  if (l === "warning") return "warn";
  if (l === "unhandledrejection") return "error";
  return l;
}

export function filterConsoleLines(
  lines: ConsoleLineView[],
  opts: { level: ConsoleLevelFilter; query: string }
): ConsoleLineView[] {
  const q = opts.query.trim().toLowerCase();
  return lines.filter(line => {
    const level = normalizeConsoleLevel(line.level);
    if (opts.level !== "all") {
      if (opts.level === "error") {
        if (level !== "error") return false;
      } else if (level !== opts.level) {
        return false;
      }
    }
    if (!q) return true;
    return (
      line.text.toLowerCase().includes(q) ||
      line.level.toLowerCase().includes(q)
    );
  });
}

/** Local wall-clock time for panel rows (HH:mm:ss.mmm). */
export function formatConsoleTime(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "--:--:--.---";
  const d = new Date(at);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export function consoleLinesToText(lines: ConsoleLineView[]): string {
  return lines
    .map(l => `${formatConsoleTime(l.at)} [${l.level}] ${l.text}`)
    .join("\n");
}
