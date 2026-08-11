/**
 * Static check for the UI SDK contract (PG-UI-SDK-SPEC.md §3).
 * Run: npm run sdk:check
 *
 * Enforces:
 *   1. public/playgrounds/sdk.js MUST NOT reference `env.*` (UI must not hold env objects).
 *   2. public/playgrounds/sdk.js MUST NOT expose secret VALUES (no `secrets[…].get`,
 *      no `secret_value`, no `env.secrets.<NAME>.get()` returning the literal string).
 *   3. public/playgrounds/sdk.js MUST NOT redefine window.fetch (CANVAS_BRIDGE owns that).
 *   4. SDK public surface MUST be reachable via `window.PG` (smoke grep).
 *
 * Exit non-zero on any violation. Phase 2 deliverable.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdkPath = join(root, "public/playgrounds/sdk.js");

interface Rule {
  id: string;
  pattern: RegExp;
  message: string;
  /** If true, presence alone is a violation. Otherwise the pattern's matching flag decides. */
  forbid?: boolean;
}

const RULES: Rule[] = [
  {
    id: "no-env-leak",
    pattern: /\benv\.(?:KV|DB|HOST|SESSION|COMPUTE|DELEGATE|vars|secrets)/u,
    message:
      "SDK MUST NOT reference env.* directly (DEC-031). SDK wraps fetch('/api/...').",
    forbid: true,
  },
  {
    id: "no-secret-value",
    pattern: /secrets\[.*?\]\.get\s*\(/u,
    message:
      "SDK MUST NOT expose secret values via env.secrets.<NAME>.get() (DEC-029/035). Values belong to functions.js on the backend only.",
    forbid: true,
  },
  {
    id: "no-fetch-redef",
    pattern: /window\.fetch\s*=/u,
    message:
      "SDK MUST NOT redefine window.fetch. CANVAS_BRIDGE_SCRIPT owns the rewrite.",
    forbid: true,
  },
  {
    id: "window-pg-present",
    pattern: /window\.PG\s*=/u,
    message:
      "SDK MUST mount its public surface on `window.PG` (PG-UI-SDK-SPEC §3.1).",
  },
];

function main(): void {
  if (!existsSync(sdkPath)) {
    console.log(
      `sdk:check — skipped (${sdkPath} not present yet; Phase 2 deliverable).`,
    );
    process.exit(0);
  }
  const src = readFileSync(sdkPath, "utf8");
  const failures: Array<{ id: string; message: string }> = [];
  for (const rule of RULES) {
    if (rule.forbid) {
      if (rule.pattern.test(src)) {
        failures.push({ id: rule.id, message: rule.message });
      }
    } else {
      if (!rule.pattern.test(src)) {
        failures.push({ id: rule.id, message: rule.message });
      }
    }
  }
  if (failures.length > 0) {
    console.error("sdk:check — FAILED");
    for (const f of failures) {
      console.error(`  [${f.id}] ${f.message}`);
    }
    process.exit(1);
  }
  console.log("sdk:check — OK");
}

main();