/**
 * Working-set helpers for sandbox Picker vs inventory (DEC-028).
 * `inWorkingSet` is orthogonal to `agentManaged`.
 */

import type { ProjectMeta } from "./projectTypes";

/**
 * Effective Picker membership.
 * Explicit `inWorkingSet` wins; missing field migrates:
 * non-agentManaged → true; agentManaged → false.
 */
export function isInWorkingSet(
  meta: Pick<ProjectMeta, "agentManaged" | "inWorkingSet"> | null | undefined
): boolean {
  if (!meta) return false;
  if (typeof meta.inWorkingSet === "boolean") return meta.inWorkingSet;
  return meta.agentManaged !== true;
}

/** Projects visible in the toolbar sandbox Picker. */
export function listWorkingSet(projects: ProjectMeta[]): ProjectMeta[] {
  return projects.filter(p => isInWorkingSet(p));
}

/** agentManaged ∧ not in working set ∧ not the active steward (recyclable). */
export function isRecyclableSandbox(
  meta: Pick<ProjectMeta, "id" | "agentManaged" | "inWorkingSet">,
  activeAgentSandboxId: string | null
): boolean {
  if (meta.agentManaged !== true) return false;
  if (isInWorkingSet(meta)) return false;
  if (activeAgentSandboxId && meta.id === activeAgentSandboxId) return false;
  return true;
}
