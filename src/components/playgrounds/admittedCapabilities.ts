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
  setAdmittedCapabilities(meta.id, meta.admittedCapabilities);
}

export function hydrateAdmittedFromMetas(
  metas: readonly Pick<ProjectMeta, "id" | "admittedCapabilities">[]
): void {
  for (const m of metas) hydrateAdmittedFromMeta(m);
}
