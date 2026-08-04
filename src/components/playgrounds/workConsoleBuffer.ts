/**
 * Ring buffer for work-project canvas console / error lines (DEC-017).
 * Shared by the shell UI and env.HOST.getConsole.
 */

export interface WorkConsoleLine {
  /** Monotonic index for since-cursor reads. */
  index: number;
  level: string;
  text: string;
  at: number;
}

const DEFAULT_MAX = 300;

let nextIndex = 0;
let maxLines = DEFAULT_MAX;
let lines: WorkConsoleLine[] = [];

export function configureWorkConsoleBuffer(max = DEFAULT_MAX): void {
  maxLines = Math.max(1, max);
  if (lines.length > maxLines) {
    lines = lines.slice(-maxLines);
  }
}

export function clearWorkConsoleBuffer(): void {
  lines = [];
}

export function appendWorkConsoleLine(
  level: string,
  text: string
): WorkConsoleLine {
  const entry: WorkConsoleLine = {
    index: nextIndex++,
    level,
    text,
    at: Date.now(),
  };
  lines.push(entry);
  if (lines.length > maxLines) {
    lines = lines.slice(-maxLines);
  }
  return entry;
}

export function listWorkConsoleLines(since?: number): WorkConsoleLine[] {
  if (since === undefined || since < 0) {
    return lines.slice();
  }
  return lines.filter(line => line.index > since);
}

export function workConsoleBufferSize(): number {
  return lines.length;
}

export function countWorkConsoleErrors(since?: number): number {
  return listWorkConsoleLines(since).filter(
    line => line.level === "error" || line.level === "unhandledrejection"
  ).length;
}

export interface WaitWorkConsoleOptions {
  since: number;
  timeoutMs?: number;
  match?: string;
  signal?: AbortSignal;
  pollMs?: number;
}

export interface WaitWorkConsoleResult {
  lines: WorkConsoleLine[];
  timedOut: boolean;
}

/** Poll until new console lines (optionally matching substring) or timeout. */
export async function waitWorkConsole(
  options: WaitWorkConsoleOptions
): Promise<WaitWorkConsoleResult> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 5000, 0), 60_000);
  const pollMs = Math.min(Math.max(options.pollMs ?? 50, 10), 1000);
  const since = options.since;
  const match = options.match;
  const signal = options.signal;
  const deadline = Date.now() + timeoutMs;

  const matches = (found: WorkConsoleLine[]) => {
    if (!found.length) return false;
    if (!match) return true;
    return found.some(line => line.text.includes(match));
  };

  for (;;) {
    if (signal?.aborted) {
      const err = new Error("waitConsole cancelled");
      (err as Error & { code?: string }).code = "cancelled";
      throw err;
    }
    const found = listWorkConsoleLines(since);
    if (matches(found)) {
      return {
        lines: match ? found.filter(l => l.text.includes(match)) : found,
        timedOut: false,
      };
    }
    if (Date.now() >= deadline) {
      return { lines: found, timedOut: true };
    }
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => resolve(), pollMs);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          const err = new Error("waitConsole cancelled");
          (err as Error & { code?: string }).code = "cancelled";
          reject(err);
        },
        { once: true }
      );
    });
  }
}

/** Test helper: reset indices and contents. */
export function resetWorkConsoleBufferForTests(): void {
  nextIndex = 0;
  lines = [];
  maxLines = DEFAULT_MAX;
}
