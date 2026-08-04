/**
 * Per-project durable state (KV / DB) move helpers.
 * Side stores stay outside the project file tree; export/clone/import may
 * carry a state bundle when explicitly requested.
 * SecretStore (DEC-029) is playground-level ciphertext and never enters .sam.
 */

import { exportMockDbBytes, importMockDbBytes } from "./mockDb";
import { exportMockKvEntries, importMockKvEntries } from "./mockKv";

export type ProjectStateParts = {
  kv: boolean;
  db: boolean;
  /**
   * @deprecated DEC-029 — always treated as false; SecretStore never moves with .sam
   */
  secrets: boolean;
};

export type ProjectStateSelection = Partial<ProjectStateParts> & {
  /** @deprecated use `db` */
  d1?: boolean;
};

export const PROJECT_STATE_NONE: ProjectStateParts = {
  kv: false,
  db: false,
  secrets: false,
};

/** KV + DB only (secrets flag kept for type compat, always false). */
export const PROJECT_STATE_ALL: ProjectStateParts = {
  kv: true,
  db: true,
  secrets: false,
};

/** In-memory / zip payload for optional durable state. */
export type ProjectStateBundle = {
  version: 1;
  kv?: Map<string, Uint8Array>;
  db?: Uint8Array;
  /** @deprecated historical key; prefer `db` */
  d1?: Uint8Array;
  /** @deprecated DEC-029 — ignored on import; never written on export */
  secrets?: Record<string, string>;
};

export function normalizeStateParts(
  sel?: ProjectStateSelection | null
): ProjectStateParts {
  return {
    kv: Boolean(sel?.kv),
    db: Boolean(sel?.db ?? sel?.d1),
    secrets: false,
  };
}

export function anyStateSelected(parts: ProjectStateParts): boolean {
  return parts.kv || parts.db;
}

export function summarizeStateParts(parts: ProjectStateParts): string {
  const labels: string[] = [];
  if (parts.kv) labels.push("KV");
  if (parts.db) labels.push("DB");
  return labels.length ? labels.join("、") : "無";
}

function bundleDbBytes(bundle: ProjectStateBundle): Uint8Array | undefined {
  if (bundle.db?.byteLength) return bundle.db;
  if (bundle.d1?.byteLength) return bundle.d1;
  return undefined;
}

/** Read selected side stores into a bundle (missing stores omitted). */
export async function collectProjectState(
  sandboxId: string,
  selection?: ProjectStateSelection | null
): Promise<ProjectStateBundle> {
  const parts = normalizeStateParts(selection);
  const bundle: ProjectStateBundle = { version: 1 };
  if (parts.kv) {
    const kv = await exportMockKvEntries(sandboxId);
    if (kv.size > 0) bundle.kv = kv;
  }
  if (parts.db) {
    const db = await exportMockDbBytes(sandboxId);
    if (db?.byteLength) bundle.db = db;
  }
  return bundle;
}

/** Apply a bundle onto a project (only parts present in the bundle). */
export async function applyProjectState(
  sandboxId: string,
  bundle: ProjectStateBundle | null | undefined,
  selection?: ProjectStateSelection | null
): Promise<ProjectStateParts> {
  const dbBytes = bundle ? bundleDbBytes(bundle) : undefined;
  const want = normalizeStateParts(
    selection ?? {
      kv: Boolean(bundle?.kv?.size),
      db: Boolean(dbBytes?.byteLength),
      secrets: false,
    }
  );
  const applied = { ...PROJECT_STATE_NONE };
  if (!bundle || bundle.version !== 1) return applied;

  if (want.kv && bundle.kv && bundle.kv.size > 0) {
    await importMockKvEntries(sandboxId, bundle.kv);
    applied.kv = true;
  }
  if (want.db && dbBytes && dbBytes.byteLength > 0) {
    await importMockDbBytes(sandboxId, dbBytes);
    applied.db = true;
  }
  return applied;
}

/** Copy selected side stores from one project id to another. */
export async function copyProjectState(
  sourceId: string,
  destId: string,
  selection?: ProjectStateSelection | null
): Promise<ProjectStateParts> {
  const parts = normalizeStateParts(selection);
  if (!anyStateSelected(parts)) return { ...PROJECT_STATE_NONE };
  const bundle = await collectProjectState(sourceId, parts);
  return applyProjectState(destId, bundle, parts);
}
