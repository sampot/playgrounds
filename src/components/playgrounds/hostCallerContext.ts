/**
 * Which sandbox is invoking env.HOST (DEC-051 grant / scope gates).
 */

let callerSandboxId: string | null = null;

export function getHostCallerSandboxId(): string | null {
  return callerSandboxId;
}

export function setHostCallerSandboxId(sandboxId: string | null): void {
  callerSandboxId = sandboxId?.trim() || null;
}

/** Run fn with HOST caller identity; restores previous caller afterward. */
export async function withHostCaller<T>(
  sandboxId: string | null,
  fn: () => Promise<T>
): Promise<T> {
  const prev = callerSandboxId;
  callerSandboxId = sandboxId?.trim() || null;
  try {
    return await fn();
  } finally {
    callerSandboxId = prev;
  }
}
