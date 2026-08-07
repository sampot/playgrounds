/**
 * In-memory admitted capability set per sandbox (DEC-036).
 * Persisted authority is ProjectMeta.admittedCapabilities; hydrate on load.
 */

import type { ProjectMeta } from "./projectTypes";
import { filterKnownCapabilities } from "./samCapabilities";

const admittedBySandbox = new Map<string, string[]>();

export function getAdmittedCapabilities(sandboxId: string): readonly string[] {
  return admittedBySandbox.get(sandboxId) ?? [];
}

export function setAdmittedCapabilities(
  sandboxId: string,
  tokens: readonly string[] | null | undefined
): void {
  const next = filterKnownCapabilities(tokens);
  if (next.length === 0) {
    admittedBySandbox.delete(sandboxId);
    return;
  }
  admittedBySandbox.set(sandboxId, [...next]);
}

export function clearAdmittedCapabilities(sandboxId: string): void {
  admittedBySandbox.delete(sandboxId);
}

export function hydrateAdmittedFromMeta(
  meta: Pick<ProjectMeta, "id" | "admittedCapabilities">
): void {
  const fromDisk = filterKnownCapabilities(meta.admittedCapabilities);
  // Avoid clobbering a fresher in-memory admit with a stale empty snapshot
  // (listProjects raced ahead of updateProjectMeta write).
  if (fromDisk.length === 0 && getAdmittedCapabilities(meta.id).length > 0) {
    return;
  }
  setAdmittedCapabilities(meta.id, fromDisk);
}

export function hydrateAdmittedFromMetas(
  metas: readonly Pick<ProjectMeta, "id" | "admittedCapabilities">[]
): void {
  for (const m of metas) hydrateAdmittedFromMeta(m);
}

/**
 * Resolve admitted scopes for API／Runtime: memory first; if empty, reload from
 * OPFS ProjectMeta (authority) and re-hydrate. Covers races where a stale
 * hydrate wiped the in-memory set after the user agreed.
 */
export async function resolveAdmittedCapabilities(
  sandboxId: string,
  readMeta: (id: string) => Promise<Pick<ProjectMeta, "admittedCapabilities">>
): Promise<readonly string[]> {
  const mem = getAdmittedCapabilities(sandboxId);
  if (mem.length > 0) return mem;
  try {
    const meta = await readMeta(sandboxId);
    const fromDisk = filterKnownCapabilities(meta.admittedCapabilities);
    if (fromDisk.length > 0) {
      setAdmittedCapabilities(sandboxId, fromDisk);
    }
    return getAdmittedCapabilities(sandboxId);
  } catch {
    return mem;
  }
}
