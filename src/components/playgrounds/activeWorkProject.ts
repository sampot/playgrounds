/**
 * Persist which OPFS project is open in the shell editor (work project).
 */

export const ACTIVE_WORK_PROJECT_STORAGE_KEY = "playgrounds-active-project";

export function readActiveWorkSandboxId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(ACTIVE_WORK_PROJECT_STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function writeActiveWorkSandboxId(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (!id) {
      localStorage.removeItem(ACTIVE_WORK_PROJECT_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_WORK_PROJECT_STORAGE_KEY, id);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
