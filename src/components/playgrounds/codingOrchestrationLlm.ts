/**
 * Coding-orchestration worker LLM helpers (DEC-033 Phase 3).
 * Pure prompt / parse — no network.
 */

import { CODING_ORCH_DEMO_PATH } from "./codingOrchestrationApi";

const ALLOWED_PATH_PREFIXES = ["src/", "README.md"];

export interface CodingWorkerEditWrite {
  path: string;
  kind: "write";
  content: string;
}

export interface CodingWorkerEditPatch {
  path: string;
  kind: "patch";
  unifiedDiff: string;
}

export type CodingWorkerEdit =
  | CodingWorkerEditWrite
  | CodingWorkerEditPatch
  | { path?: string; kind: "note"; note?: string };

export interface CodingWorkerLlmResult {
  summary: string;
  edits: CodingWorkerEdit[];
}

export function pathAllowedForCodingWorker(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  if (!p || p.includes("..") || p.startsWith(".agent/") || p.includes("\\")) {
    return false;
  }
  return ALLOWED_PATH_PREFIXES.some(
    prefix => p === prefix || p.startsWith(prefix)
  );
}

/** Deterministic dogfood fix when LLM is unavailable. */
export function codingWorkerRuleFix(before: string): string {
  return String(before || "")
    .replace("return a + b + 1; // bug: off-by-one", "return a + b;")
    .replace("return a + b + 1;", "return a + b;");
}

export function buildCodingWorkerSystemPrompt(): string {
  return [
    "You are a coding-orchestration worker in Playgrounds.",
    "Return ONLY a single JSON object (no markdown fences) with shape:",
    '{"summary":"…","edits":[{"path":"src/…","kind":"write","content":"…"}]}',
    'Prefer kind "write" for small files; "patch" with unifiedDiff is also ok.',
    "Allowed paths: src/** and README.md. Do not touch .agent/ or secrets.",
    "Do not invent files outside the brief. Keep edits minimal.",
  ].join(" ");
}

export function buildCodingWorkerUserPrompt(opts: {
  taskId: string;
  brief: string;
  path?: string;
  content?: string;
}): string {
  const path = (opts.path || CODING_ORCH_DEMO_PATH).replace(/^\/+/, "");
  const content = opts.content ?? "";
  return [
    `taskId: ${opts.taskId}`,
    `brief: ${opts.brief}`,
    `file path: ${path}`,
    "current file content:",
    "```",
    content,
    "```",
  ].join("\n");
}

function stripFences(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return m ? m[1]!.trim() : t;
}

/**
 * Parse model text into summary + edits; rejects disallowed paths.
 */
export function parseCodingWorkerLlmEdits(
  text: string
): CodingWorkerLlmResult | { error: string; code: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return { error: "LLM 回傳不是 JSON", code: "llm_parse_error" };
  }
  if (!raw || typeof raw !== "object") {
    return { error: "LLM JSON 無效", code: "llm_parse_error" };
  }
  const o = raw as Record<string, unknown>;
  const summary =
    typeof o.summary === "string" && o.summary.trim()
      ? o.summary.trim()
      : "worker edit";
  if (!Array.isArray(o.edits) || o.edits.length === 0) {
    return { error: "缺少 edits", code: "llm_parse_error" };
  }
  const edits: CodingWorkerEdit[] = [];
  for (const item of o.edits) {
    if (!item || typeof item !== "object") {
      return { error: "無效 edit", code: "llm_parse_error" };
    }
    const e = item as Record<string, unknown>;
    const kind = String(e.kind || "");
    if (kind === "note") {
      edits.push({
        kind: "note",
        path: typeof e.path === "string" ? e.path : undefined,
        note: typeof e.note === "string" ? e.note : undefined,
      });
      continue;
    }
    const path = String(e.path || "").replace(/^\/+/, "");
    if (!pathAllowedForCodingWorker(path)) {
      return { error: `路徑不允許：${path}`, code: "edit_path_forbidden" };
    }
    if (kind === "write") {
      edits.push({ path, kind: "write", content: String(e.content ?? "") });
      continue;
    }
    if (kind === "patch") {
      const unifiedDiff = String(e.unifiedDiff || "");
      if (!unifiedDiff) {
        return { error: "patch 需要 unifiedDiff", code: "llm_parse_error" };
      }
      edits.push({ path, kind: "patch", unifiedDiff });
      continue;
    }
    return { error: `不支援 edit.kind：${kind}`, code: "llm_parse_error" };
  }
  if (!edits.some(e => e.kind === "write" || e.kind === "patch")) {
    return { error: "edits 沒有 write／patch", code: "llm_parse_error" };
  }
  return { summary, edits };
}
