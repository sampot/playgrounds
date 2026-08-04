/**
 * Scheme A working memory for Playgrounds coding agent:
 * single HOST + .agent/plan.md + .agent/memory.md (no sub-agents / no RAG).
 * Canonical helpers; mirrored inside sampot/pg-steward `app.js` where needed.
 */

import { parsePlanChecklist, type PlanItem } from "./agentUx";
import { truncateForContext } from "./agentContext";

export const PLAN_PATH = ".agent/plan.md";
export const MEMORY_PATH = ".agent/memory.md";

export const PLAN_SEED = `# Plan

Multi-step work checklist (GitHub-flavored). Update as you go.

- [ ] Clarify the user goal
- [ ] Search / list relevant files
- [ ] Make a small change
- [ ] Verify (reload_canvas + console / network / dom as needed)
`;

export const MEMORY_SEED = `# Memory

Durable notes for this work project. Keep short bullets; rewrite freely.
These survive long chats when tool results are compacted.

## Decisions
-

## Constraints
-

## Key paths
-
`;

export type WorkingMemoryFileStatus = {
  path: string;
  created: boolean;
  existed: boolean;
};

export type EnsureWorkingMemoryResult = {
  files: WorkingMemoryFileStatus[];
};

/** Next open checklist items (not done), oldest first. */
export function nextOpenPlanItems(markdown: string, limit = 3): PlanItem[] {
  const items = parsePlanChecklist(markdown).filter(item => !item.done);
  return items.slice(0, Math.max(0, limit));
}

export function planProgress(markdown: string): {
  done: number;
  total: number;
  open: PlanItem[];
} {
  const items = parsePlanChecklist(markdown);
  const open = items.filter(i => !i.done);
  return {
    done: items.length - open.length,
    total: items.length,
    open,
  };
}

/**
 * Compact "what to do next" block for system/opening context.
 * Prefer calling after ensure seeds exist.
 */
export function formatTaskFocus(opts: {
  planMarkdown?: string | null;
  memoryMarkdown?: string | null;
  openLimit?: number;
  memoryMaxChars?: number;
}): string {
  const openLimit = opts.openLimit ?? 3;
  const memoryMaxChars = opts.memoryMaxChars ?? 900;
  const lines: string[] = ["## Task focus (scheme A — single agent)"];

  const planMd = opts.planMarkdown ?? "";
  const progress = planProgress(planMd);
  if (progress.total === 0) {
    lines.push(
      `Plan: no checklist yet — use write_plan to create ${PLAN_PATH} items.`
    );
  } else {
    lines.push(`Plan progress: ${progress.done}/${progress.total} done.`);
    const next = progress.open.slice(0, openLimit);
    if (!next.length) {
      lines.push(
        "Next: all checklist items done — confirm with user or clear plan."
      );
    } else {
      lines.push("Next open items:");
      next.forEach((item, i) => lines.push(`${i + 1}. ${item.text}`));
    }
  }

  const mem = (opts.memoryMarkdown || "").trim();
  if (mem) {
    const cut = truncateForContext(mem, memoryMaxChars);
    lines.push("Memory excerpt:");
    lines.push(cut.text);
  } else {
    lines.push(
      `Memory: empty — record durable facts with write_memory → ${MEMORY_PATH}.`
    );
  }

  lines.push(
    "After meaningful progress: update plan checkboxes; after decisions/constraints: update memory. Do not rely on omitted tool payloads."
  );
  return lines.join("\n");
}

/** Decide whether a path is a working-memory file the UI should refresh. */
export function isWorkingMemoryPath(path: string | null | undefined): boolean {
  if (!path) return false;
  const p = path.replace(/^\.?\//u, "");
  return p === PLAN_PATH || p === MEMORY_PATH;
}

export function seedContentForPath(path: string): string | null {
  if (path === PLAN_PATH) return PLAN_SEED;
  if (path === MEMORY_PATH) return MEMORY_SEED;
  return null;
}
