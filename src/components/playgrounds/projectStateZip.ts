/**
 * Encode / decode ProjectStateBundle under `.playgrounds-state/` inside a .sam ZIP.
 */

import { strFromU8, strToU8 } from "fflate";
import type { ProjectStateBundle, ProjectStateParts } from "./projectState";
import { PROJECT_STATE_NONE, normalizeStateParts } from "./projectState";

export const STATE_DIR = ".playgrounds-state";
export const STATE_MANIFEST = `${STATE_DIR}/manifest.json`;
const STATE_DB_SQLITE = `${STATE_DIR}/db/db.sqlite`;
/** Legacy zip path (pre-rename from D1). */
const LEGACY_STATE_D1_SQLITE = `${STATE_DIR}/d1/db.sqlite`;

type StateManifest = {
  version: 1;
  includes: ProjectStateParts & { d1?: boolean };
};

function encodeKvFileName(key: string): string {
  return encodeURIComponent(key);
}

function decodeKvFileName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function isStatePath(path: string): boolean {
  return path === STATE_DIR || path.startsWith(`${STATE_DIR}/`);
}

/** Flatten a state bundle into zip path → bytes (relative to project root). */
export function stateBundleToZipEntries(
  bundle: ProjectStateBundle
): Record<string, Uint8Array> {
  const dbBytes = bundle.db ?? bundle.d1;
  const includes: ProjectStateParts = {
    kv: Boolean(bundle.kv && bundle.kv.size > 0),
    db: Boolean(dbBytes && dbBytes.byteLength > 0),
    secrets: Boolean(bundle.secrets && Object.keys(bundle.secrets).length > 0),
  };
  if (!includes.kv && !includes.db && !includes.secrets) return {};

  const out: Record<string, Uint8Array> = {};
  const manifest: StateManifest = { version: 1, includes };
  out[STATE_MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));

  if (includes.kv && bundle.kv) {
    for (const [key, bytes] of bundle.kv) {
      out[`${STATE_DIR}/kv/${encodeKvFileName(key)}`] = bytes;
    }
  }
  if (includes.db && dbBytes) {
    out[STATE_DB_SQLITE] = dbBytes;
  }
  if (includes.secrets && bundle.secrets) {
    out[`${STATE_DIR}/secrets.json`] = strToU8(
      JSON.stringify(bundle.secrets, null, 2)
    );
  }
  return out;
}

/** Parse `.playgrounds-state/*` entries from a zip path map (relative paths). */
export function zipEntriesToStateBundle(
  entries: Record<string, Uint8Array>
): ProjectStateBundle | null {
  const statePaths = Object.keys(entries).filter(isStatePath);
  if (statePaths.length === 0) return null;

  let includes = { ...PROJECT_STATE_NONE };
  const manifestBytes = entries[STATE_MANIFEST];
  if (manifestBytes) {
    try {
      const parsed = JSON.parse(strFromU8(manifestBytes)) as StateManifest;
      if (parsed?.version === 1 && parsed.includes) {
        includes = normalizeStateParts(parsed.includes);
      }
    } catch {
      /* infer from files */
    }
  }

  const bundle: ProjectStateBundle = { version: 1 };
  const kv = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (!isStatePath(path)) continue;
    if (path.startsWith(`${STATE_DIR}/kv/`)) {
      const name = path.slice(`${STATE_DIR}/kv/`.length);
      if (name) kv.set(decodeKvFileName(name), bytes);
    } else if (path === STATE_DB_SQLITE || path === LEGACY_STATE_D1_SQLITE) {
      bundle.db = bytes;
      includes.db = true;
    } else if (path === `${STATE_DIR}/secrets.json`) {
      try {
        const obj = JSON.parse(strFromU8(bytes)) as Record<string, unknown>;
        const secrets: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string") secrets[k] = v;
        }
        if (Object.keys(secrets).length > 0) {
          bundle.secrets = secrets;
          includes.secrets = true;
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (kv.size > 0) {
    bundle.kv = kv;
    includes.kv = true;
  }

  if (!includes.kv && !includes.db && !includes.secrets) return null;
  return bundle;
}
