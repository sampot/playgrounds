/**
 * Pure UX helpers for the Playgrounds agent starter (Round 2).
 * Logic is mirrored inside sampot/pg-steward `app.js` (canvas SPA cannot import this module).
 */

export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  hint: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "需 OpenAI API key；瀏覽器直連可能受 CORS 限制。",
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    hint: "有免費額度；OpenAI-compatible。",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    hint: "多模型路由；注意 CORS／Referer 政策。",
  },
  {
    id: "local",
    label: "本機",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    hint: "LM Studio／Ollama 等需開 CORS；本機 endpoint 可不選密鑰。",
  },
];

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.id === id);
}

/** Loopback OpenAI-compatible servers (LM Studio / Ollama) — secret optional. */
export function isLocalLlmBaseUrl(baseUrl?: string | null): boolean {
  if (!baseUrl || typeof baseUrl !== "string") return false;
  try {
    const host = new URL(baseUrl.trim()).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export function formatStepLabel(
  step: number,
  maxSteps: number,
  toolName?: string | null
): string {
  const base = `步驟 ${step}/${maxSteps}`;
  if (toolName && toolName.trim()) return `${base} · ${toolName.trim()}`;
  return `${base} · 思考中`;
}

export function settingsReady(settings: {
  /** @deprecated DEC-029 — use secretName + SecretStore */
  apiKey?: string;
  secretName?: string;
  baseUrl?: string;
}): boolean {
  const base =
    typeof settings.baseUrl === "string" ? settings.baseUrl.trim() : "";
  if (!base) return false;
  if (isLocalLlmBaseUrl(base)) return true;
  const hasSecret = Boolean(
    (typeof settings.secretName === "string" && settings.secretName.trim()) ||
    (typeof settings.apiKey === "string" && settings.apiKey.trim())
  );
  return hasSecret;
}

/** Extract a project-relative path from tool args / results when obvious. */
export function extractToolPath(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  for (const key of ["path", "file", "filePath"]) {
    if (typeof o[key] === "string" && o[key].trim()) return o[key].trim();
  }
  return null;
}

export function extractResultPaths(value: unknown): string[] {
  const paths = new Set<string>();
  const direct = extractToolPath(value);
  if (direct) paths.add(direct);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.written)) {
      for (const item of o.written) {
        if (typeof item === "string" && item.trim()) paths.add(item.trim());
        else {
          const p = extractToolPath(item);
          if (p) paths.add(p);
        }
      }
    }
    if (Array.isArray(o.paths)) {
      for (const item of o.paths) {
        if (typeof item === "string" && item.trim()) paths.add(item.trim());
      }
    }
  }
  return [...paths];
}

function oneLine(text: string, max = 72): string {
  const one = text.replace(/\s+/gu, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max)}…`;
}

export function summarizeToolCall(
  name: string,
  args: unknown
): { preview: string; path: string | null } {
  const path = extractToolPath(args);
  if (name === "write_file" || name === "write_file_base64") {
    const content =
      args && typeof args === "object"
        ? ((args as { content?: unknown; base64?: unknown }).content ??
          (args as { base64?: unknown }).base64)
        : null;
    const lines =
      typeof content === "string" ? content.split("\n").length : undefined;
    const bits = [
      path || "?",
      typeof lines === "number" ? `${lines} 行` : null,
      typeof content === "string" ? `${content.length} 字` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      preview: bits || oneLine(JSON.stringify(args ?? {})),
      path,
    };
  }
  if (name === "run_cmd") {
    const o =
      args && typeof args === "object" ? (args as Record<string, unknown>) : {};
    const cmd = typeof o.cmd === "string" ? o.cmd : "?";
    const argv = Array.isArray(o.args) ? o.args.map(String).join(" ") : "";
    return {
      preview: oneLine(`${cmd}${argv ? ` ${argv}` : ""}`),
      path: null,
    };
  }
  if (path) {
    return { preview: oneLine(path), path };
  }
  try {
    return { preview: oneLine(JSON.stringify(args ?? {})), path: null };
  } catch {
    return { preview: String(args), path: null };
  }
}

export function summarizeToolResult(
  name: string,
  result: unknown
): { preview: string; paths: string[] } {
  const paths = extractResultPaths(result);
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (typeof o.error === "string") {
      return { preview: oneLine(`錯誤：${o.error}`), paths };
    }
    if (name === "write_file" || name === "write_file_base64") {
      const hash =
        typeof o.hash === "string"
          ? o.hash.slice(0, 8)
          : typeof o.contentHash === "string"
            ? o.contentHash.slice(0, 8)
            : null;
      const parts = [
        paths[0] || extractToolPath(result) || "ok",
        hash ? `hash ${hash}` : null,
      ].filter(Boolean);
      return { preview: parts.join(" · "), paths };
    }
    if (name === "run_cmd") {
      const code = o.exitCode ?? o.code;
      const stdout = typeof o.stdout === "string" ? oneLine(o.stdout, 48) : "";
      return {
        preview: oneLine(`exit ${code ?? "?"}${stdout ? ` · ${stdout}` : ""}`),
        paths,
      };
    }
    if (name === "checkpoint") {
      const id = typeof o.id === "string" ? o.id : null;
      return {
        preview: id ? `checkpoint ${id}` : "checkpoint ok",
        paths,
      };
    }
  }
  if (typeof result === "string") {
    return { preview: oneLine(result), paths };
  }
  try {
    return { preview: oneLine(JSON.stringify(result ?? {})), paths };
  } catch {
    return { preview: String(result), paths };
  }
}

/** Minimal unified diff for short text (no external deps). */
export function simpleUnifiedDiff(
  before: string,
  after: string,
  path = "file",
  maxHunkLines = 80
): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const header = [`--- a/${path}`, `+++ b/${path}`];
  // Myers-lite: longest common subsequence via DP only for small files.
  if (a.length + b.length > 400) {
    return [
      ...header,
      `@@ truncated @@`,
      `-${a.length} lines`,
      `+${b.length} lines`,
    ].join("\n");
  }
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        a[i] === b[j]
          ? (dp[i + 1]![j + 1] ?? 0) + 1
          : Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
    }
  }
  const lines: string[] = [...header, "@@"];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      lines.push(` ${a[i]}`);
      i += 1;
      j += 1;
    } else if (
      j < m &&
      (i >= n || (dp[i]![j + 1] ?? 0) >= (dp[i + 1]![j] ?? 0))
    ) {
      lines.push(`+${b[j]}`);
      j += 1;
    } else if (i < n) {
      lines.push(`-${a[i]}`);
      i += 1;
    }
    if (lines.length > maxHunkLines + 3) {
      lines.push("…[diff truncated]");
      break;
    }
  }
  return lines.join("\n");
}

export interface PlanItem {
  done: boolean;
  text: string;
}

/** Parse GitHub-flavored task list lines from plan markdown. */
export function parsePlanChecklist(markdown: string): PlanItem[] {
  const items: PlanItem[] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/u);
    if (!m) continue;
    items.push({
      done: m[1]!.toLowerCase() === "x",
      text: m[2]!.trim(),
    });
  }
  return items;
}

export function formatWorkProjectLabel(
  name: string | null | undefined,
  id: string | null | undefined
): string {
  if (name && name.trim()) return name.trim();
  if (id && id.trim()) {
    const short = id.trim();
    return short.length > 16 ? `${short.slice(0, 16)}…` : short;
  }
  return "未選沙盒";
}

export type QueuedMessage = { text: string; queuedAt: number };

export function enqueueMessage(
  queue: QueuedMessage[],
  text: string,
  now = Date.now()
): QueuedMessage[] {
  const trimmed = text.trim();
  if (!trimmed) return queue;
  return [...queue, { text: trimmed, queuedAt: now }];
}

export function dequeueMessage(queue: QueuedMessage[]): {
  next: QueuedMessage | null;
  rest: QueuedMessage[];
} {
  if (!queue.length) return { next: null, rest: queue };
  const [next, ...rest] = queue;
  return { next: next ?? null, rest };
}

/**
 * Truncate transcript to the last user message (inclusive), dropping later
 * assistant/tool turns — used for retry after a failed run.
 */
export function transcriptForRetry<
  T extends { role?: string; content?: unknown },
>(messages: T[]): T[] {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return messages;
  return messages.slice(0, lastUser + 1);
}

/** Drop the last user turn and everything after (edit-and-resend). */
export function transcriptBeforeLastUser<
  T extends { role?: string; content?: unknown },
>(messages: T[]): { kept: T[]; lastUserText: string | null } {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") {
      lastUser = i;
      break;
    }
  }
  if (lastUser < 0) return { kept: messages, lastUserText: null };
  const msg = messages[lastUser];
  const lastUserText = typeof msg?.content === "string" ? msg.content : null;
  return { kept: messages.slice(0, lastUser), lastUserText };
}
