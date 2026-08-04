/**
 * Active delegate grants for Tool tabs and session workers (DEC-037).
 * Shell-side registry; not Durable — cleared on session close / task end.
 */

import {
  normalizeGrant,
  type ToolGrant,
  type ToolGrantMode,
} from "./toolGrant";

export type DelegateGrantSource = "tool" | "worker";

export interface ActiveDelegateGrant {
  /** Delegate sandbox (Tool SAM or worker Agent). */
  sandboxId: string;
  grant: ToolGrant;
  source: DelegateGrantSource;
  taskId?: string;
  seatId?: string;
  focusPath?: string;
}

const bySandbox = new Map<string, ActiveDelegateGrant>();

export function setDelegateGrant(
  entry: ActiveDelegateGrant
): ActiveDelegateGrant {
  const grant = normalizeGrant({
    hostSandboxId: entry.grant.hostSandboxId,
    paths: entry.grant.paths,
    mode: entry.grant.mode,
  });
  const next: ActiveDelegateGrant = {
    ...entry,
    grant,
    sandboxId: entry.sandboxId.trim(),
  };
  if (!next.sandboxId) {
    throw new Error("delegate grant sandboxId 不可為空");
  }
  bySandbox.set(next.sandboxId, next);
  return next;
}

export function setWorkerDelegateGrant(opts: {
  sandboxId: string;
  hostSandboxId: string;
  paths: string[];
  mode?: ToolGrantMode;
  taskId?: string;
  seatId?: string;
  focusPath?: string;
}): ActiveDelegateGrant {
  return setDelegateGrant({
    sandboxId: opts.sandboxId,
    source: "worker",
    taskId: opts.taskId,
    seatId: opts.seatId,
    focusPath: opts.focusPath,
    grant: normalizeGrant({
      hostSandboxId: opts.hostSandboxId,
      paths: opts.paths,
      mode: opts.mode ?? "readwrite",
    }),
  });
}

export function getDelegateGrant(
  sandboxId: string
): ActiveDelegateGrant | null {
  return bySandbox.get(sandboxId) ?? null;
}

export function clearDelegateGrant(sandboxId: string): boolean {
  return bySandbox.delete(sandboxId);
}

/** Clear grants tied to a task (worker source). */
export function clearDelegateGrantsForTask(taskId: string): number {
  let n = 0;
  for (const [id, entry] of bySandbox) {
    if (entry.source === "worker" && entry.taskId === taskId) {
      bySandbox.delete(id);
      n += 1;
    }
  }
  return n;
}

export function clearWorkerDelegateGrants(): number {
  let n = 0;
  for (const [id, entry] of bySandbox) {
    if (entry.source === "worker") {
      bySandbox.delete(id);
      n += 1;
    }
  }
  return n;
}

export function clearAllDelegateGrants(): void {
  bySandbox.clear();
}

export function listDelegateGrants(): ActiveDelegateGrant[] {
  return [...bySandbox.values()];
}
