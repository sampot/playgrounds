/**
 * Sandbox root `.env` → env.vars (DEC-035 / PG-SAM-ENV-SPEC).
 * Dotenv subset: KEY=value, quotes, # comments; skip illegal lines.
 */

import { isReservedSecretName } from "./secretStoreCrypto";

/** Hard cap per SAM-ENV-SPEC (§6); oversized → empty vars. */
export const ENV_VARS_MAX_BYTES = 64 * 1024;

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * Parse dotenv subset into a plain string map (last key wins).
 * Skips blank lines, `#` comments, illegal keys, and reserved top-level names.
 */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = String(text ?? "").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!KEY_RE.test(key) || isReservedSecretName(key)) continue;
    let raw = trimmed.slice(eq + 1);
    // trim only unquoted outer whitespace
    if (
      (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
      (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
    ) {
      raw = raw.slice(1, -1);
    } else {
      raw = raw.trim();
    }
    out[key] = raw;
  }
  return out;
}

/** Build frozen env.vars namespace from optional `.env` text. */
export function createEnvVarsNamespace(
  dotenvText: string | null | undefined
): Readonly<Record<string, string>> {
  if (dotenvText == null || dotenvText === "") {
    return Object.freeze({});
  }
  const bytes = new TextEncoder().encode(dotenvText).byteLength;
  if (bytes > ENV_VARS_MAX_BYTES) {
    return Object.freeze({});
  }
  return Object.freeze(parseDotEnv(dotenvText));
}

/** Read UTF-8 `.env` from a file map when present as text. */
export function readDotEnvTextFromFiles(
  files: Record<string, unknown> | null | undefined
): string | undefined {
  if (!files) return undefined;
  const v = files[".env"];
  return typeof v === "string" ? v : undefined;
}
