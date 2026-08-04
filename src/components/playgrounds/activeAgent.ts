/**
 * Persist which OPFS project is the active agent (DEC-017).
 */

export const ACTIVE_AGENT_STORAGE_KEY = "playgrounds-active-agent";

export function readActiveAgentSandboxId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(ACTIVE_AGENT_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function writeActiveAgentSandboxId(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (!id) {
      localStorage.removeItem(ACTIVE_AGENT_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_AGENT_STORAGE_KEY, id);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
