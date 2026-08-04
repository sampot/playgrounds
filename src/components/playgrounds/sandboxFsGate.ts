/**
 * Shell-side sandbox FS mutual exclusion (DEC-039 Phase 5).
 *
 * Serializes per **sandboxId** (not tab-global):
 * - WASI `runCmd` (OPFS SyncAccessHandle in hostWasi.worker)
 * - sandboxAuthority／`backendFsOp` authoritative reads／writes
 *
 * Prevents SyncAccessHandle vs createWritable／fsOp races on the same OPFS root.
 * Re-entrancy is NOT supported — nested callers must not take the gate again
 * while an outer holder awaits an authority load.
 */

const chains = new Map<string, Promise<unknown>>();

function chainFor(sandboxId: string): Promise<unknown> {
  let chain = chains.get(sandboxId);
  if (!chain) {
    chain = Promise.resolve();
    chains.set(sandboxId, chain);
  }
  return chain;
}

/** Run `fn` exclusively against other holders of the same `sandboxId`. */
export function withSandboxFsGate<T>(
  sandboxId: string,
  fn: () => Promise<T>
): Promise<T> {
  const id = sandboxId.trim();
  if (!id) {
    throw new Error("withSandboxFsGate requires sandboxId");
  }
  const prev = chainFor(id);
  const run = prev.then(fn, fn);
  chains.set(
    id,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

/** Test helper — reset queues between tests. */
export function resetSandboxFsGateForTests(): void {
  chains.clear();
}
