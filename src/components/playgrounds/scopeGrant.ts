/**
 * Persisted scope grants on target sandboxes (DEC-051 §6.5).
 * Explicit (Tool-family) or create-auto; content survives creator delete.
 */

import { normalizeProjectPath } from "./pathUtils";
import type { ProjectMeta } from "./projectTypes";
import {
  canonicalizeGrantPath,
  pathMatchesGrant,
  type ToolGrantMode,
} from "./toolGrant";

export type ScopeGrantSource = "explicit" | "auto";

/** Sentinel: entire sandbox tree (normalizeProjectPath("/") is empty). */
export const SCOPE_GRANT_WHOLE_TREE = "*";

export interface ScopeGrantEntry {
  /** SAM sandbox allowed to use HOST FS methods on this target. */
  granteeSandboxId: string;
  paths: string[];
  mode: ToolGrantMode;
  source: ScopeGrantSource;
}

function normalizeScopeGrantPath(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (
    !trimmed ||
    trimmed === "/" ||
    trimmed === "*" ||
    trimmed === "**" ||
    trimmed === "."
  ) {
    return SCOPE_GRANT_WHOLE_TREE;
  }
  try {
    const norm = canonicalizeGrantPath(trimmed);
    if (!norm) return SCOPE_GRANT_WHOLE_TREE;
    return norm;
  } catch {
    const n = normalizeProjectPath(trimmed);
    return n || SCOPE_GRANT_WHOLE_TREE;
  }
}

export function normalizeScopeGrantEntry(
  raw: Partial<ScopeGrantEntry> & {
    granteeSandboxId: string;
    paths?: string[];
    mode?: ToolGrantMode;
    source?: ScopeGrantSource;
  }
): ScopeGrantEntry {
  const mode: ToolGrantMode =
    raw.mode === "read" || raw.mode === "readwrite" ? raw.mode : "readwrite";
  const source: ScopeGrantSource =
    raw.source === "explicit" ? "explicit" : "auto";
  const inputPaths = raw.paths?.length ? raw.paths : [SCOPE_GRANT_WHOLE_TREE];
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const p of inputPaths) {
    const norm = normalizeScopeGrantPath(p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    paths.push(norm);
  }
  if (paths.includes(SCOPE_GRANT_WHOLE_TREE)) {
    return {
      granteeSandboxId: raw.granteeSandboxId.trim(),
      paths: [SCOPE_GRANT_WHOLE_TREE],
      mode,
      source,
    };
  }
  return {
    granteeSandboxId: raw.granteeSandboxId.trim(),
    paths,
    mode,
    source,
  };
}

export function listScopeGrants(
  meta: Pick<ProjectMeta, "scopeGrants"> | null | undefined
): ScopeGrantEntry[] {
  if (!meta?.scopeGrants?.length) return [];
  return meta.scopeGrants
    .filter(g => g?.granteeSandboxId)
    .map(g => normalizeScopeGrantEntry(g));
}

export function findScopeGrant(
  meta: Pick<ProjectMeta, "scopeGrants"> | null | undefined,
  granteeSandboxId: string
): ScopeGrantEntry | null {
  const id = granteeSandboxId.trim();
  if (!id) return null;
  return listScopeGrants(meta).find(g => g.granteeSandboxId === id) ?? null;
}

export function upsertScopeGrant(
  existing: ScopeGrantEntry[] | null | undefined,
  entry: ScopeGrantEntry
): ScopeGrantEntry[] {
  const next = normalizeScopeGrantEntry(entry);
  const out = (existing ?? [])
    .filter(g => g.granteeSandboxId !== next.granteeSandboxId)
    .map(g => normalizeScopeGrantEntry(g));
  out.push(next);
  return out;
}

export function removeScopeGrant(
  existing: ScopeGrantEntry[] | null | undefined,
  granteeSandboxId: string
): ScopeGrantEntry[] {
  const id = granteeSandboxId.trim();
  return (existing ?? []).filter(g => g.granteeSandboxId !== id);
}

export function scopeGrantAllowsPath(
  grant: ScopeGrantEntry,
  path: string,
  needWrite: boolean
): boolean {
  if (needWrite && grant.mode !== "readwrite") return false;
  if (grant.paths.includes(SCOPE_GRANT_WHOLE_TREE)) return true;
  return pathMatchesGrant(path, grant.paths);
}

export function scopeGrantAllowsAnyPath(
  grant: ScopeGrantEntry,
  needWrite: boolean
): boolean {
  if (needWrite && grant.mode !== "readwrite") return false;
  return grant.paths.length > 0;
}
