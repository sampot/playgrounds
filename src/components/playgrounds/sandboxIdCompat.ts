/**
 * sandboxId migration helpers (DEC-031 / AGENT-MODEL Phase 0b).
 * Prefer `sandboxId`; accept deprecated `projectId` (and *ProjectId suffixes) on input.
 */

function asBag(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return input as Record<string, unknown>;
}

function pickString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/** Read sandbox id from an options bag (`sandboxId` or deprecated `projectId`). */
export function readSandboxIdField(input: unknown, ...keys: string[]): string {
  const bag = asBag(input);
  if (!bag) return "";
  const ordered = keys.length > 0 ? keys : ["sandboxId", "projectId"];
  return pickString(...ordered.map(k => bag[k]));
}

export function readToolSandboxId(input: unknown): string {
  return readSandboxIdField(input, "toolSandboxId", "toolProjectId");
}

export function readHostSandboxId(input: unknown): string {
  return readSandboxIdField(input, "hostSandboxId", "hostProjectId");
}
