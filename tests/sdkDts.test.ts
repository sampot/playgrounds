// Phase 6 (3): pin the SDK `.d.ts` so strongly-typed SAMs (JSDoc or
// via `// @ts-check`) can `window.PG` type-checked against the SPEC
// §3 contract. The `.d.ts` mirrors the runtime surface in
// `public/playgrounds/sdk.js` so the two stay aligned; any new method
// on `sdk.js` must land in the `.d.ts` and vice versa.
//
// The runtime itself is type-erased (`window.PG` is `any`), so this
// file is a static contract: it parses the `.d.ts` text and asserts
// the contract shapes we depend on.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dtsPath = join(here, "../public/playgrounds/sdk.d.ts");

function readDts(): string {
  return readFileSync(dtsPath, "utf8");
}

describe("public/playgrounds/sdk.d.ts", () => {
  it("exists and is non-empty", () => {
    const text = readDts();
    expect(text.length).toBeGreaterThan(0);
  });

  it("declares window.PG with the SPEC §3 intrinsic shape", () => {
    const text = readDts();
    expect(text).toMatch(/declare\s+global\s*\{/u);
    expect(text).toMatch(/interface\s+Window/u);
    expect(text).toMatch(/PG\s*:\s*PgSdk/u);
    // Intrinsic capabilities
    expect(text).toMatch(/\bkv\s*:\s*PgKv\b/u);
    expect(text).toMatch(/\bdb\s*:\s*PgDb\b/u);
    expect(text).toMatch(/\bvars\s*:\s*PgVars\b/u);
    // Capability slots
    expect(text).toMatch(/\bSESSION\?\s*:\s*PgSession\b/u);
    expect(text).toMatch(/\bCOMPUTE\?\s*:\s*PgCompute\b/u);
    expect(text).toMatch(/\bDELEGATE\?\s*:\s*PgDelegate\b/u);
    expect(text).toMatch(/\bHOST\?\s*:\s*PgHost\b/u);
  });

  it("exposes the SPEC §3.4 PgError shape", () => {
    const text = readDts();
    expect(text).toMatch(/interface\s+PgError\b/u);
    expect(text).toMatch(/code\s*:\s*\n?\s*\|?\s*"/u);
    // 8 of 9 properties from SPEC §3.4 — exhaustive list:
    expect(text).toMatch(/"capability_not_granted"/u);
    expect(text).toMatch(/"binding_unavailable"/u);
    expect(text).toMatch(/"kv_key_too_large"/u);
    expect(text).toMatch(/"db_sql_error"/u);
    expect(text).toMatch(/"secrets_locked"/u);
    expect(text).toMatch(/"session_not_seated"/u);
    expect(text).toMatch(/"functions_unavailable"/u);
    expect(text).toMatch(/"functions_no_leader"/u);
    expect(text).toMatch(/"internal_error"/u);
    expect(text).toMatch(/status\s*:\s*number/u);
  });

  it("exposes a `fetch(path, init)` escape hatch for custom routes", () => {
    const text = readDts();
    expect(text).toMatch(
      /fetch\s*\(\s*path\s*:\s*string\s*,\s*init\s*\?\s*:\s*RequestInit\s*\)/u,
    );
  });

  it("PgVars is read-only with a keys() helper", () => {
    const text = readDts();
    expect(text).toMatch(/interface\s+PgVars\b/u);
    expect(text).toMatch(/readonly\s+\[key\s*:\s*string\s*\]\s*:/u);
    expect(text).toMatch(/keys\s*\(\s*\)\s*:\s*ReadonlyArray<string>/u);
    expect(text).toMatch(/has\s*\(\s*key\s*:\s*string\s*\)\s*:\s*boolean/u);
  });

  it("PgKv has get/put/delete/list (SPEC §3.2)", () => {
    const text = readDts();
    expect(text).toMatch(/get\s*\(\s*key\s*:\s*string\s*\)/u);
    expect(text).toMatch(/put\s*\(\s*key\s*:\s*string\s*,\s*value\s*:\s*string/u);
    expect(text).toMatch(/delete\s*\(\s*key\s*:\s*string\s*\)/u);
    expect(text).toMatch(/\blist\s*\(/u);
  });

  it("PgDb has prepare/batch/exec and a chained statement (SPEC §3.2)", () => {
    const text = readDts();
    expect(text).toMatch(/prepare\s*\(\s*sql\s*:\s*string\s*\)\s*:\s*PgDbStatement/u);
    expect(text).toMatch(/batch\s*\(/u);
    expect(text).toMatch(/exec\s*\(/u);
    expect(text).toMatch(/all\s*<T\s*=/u);
    expect(text).toMatch(/first\s*<T\s*=/u);
    expect(text).toMatch(/\brun\s*\(/u);
    expect(text).toMatch(/raw\s*<T\s*=/u);
  });

  it("PgHost is open-ended (DEC-051): index signature, no hard method list", () => {
    const text = readDts();
    expect(text).toMatch(/interface\s+PgHost\b/u);
    expect(text).toMatch(/\[\s*method\s*:\s*string\s*\]\s*:/u);
  });

  it("mirrors what sdk.js actually exposes (no drift)", () => {
    const text = readDts();
    // Pull the runtime's own surface (synchronous getter methods on
    // the published `window.PG` object). The d.ts must match.
    const sdkJs = readFileSync(
      join(here, "../public/playgrounds/sdk.js"),
      "utf8",
    );
    const surfaceTokens = [
      "kv",
      "db",
      "vars",
      "SESSION",
      "COMPUTE",
      "DELEGATE",
      "HOST",
      "capabilities",
      "fetch",
    ];
    for (const surface of surfaceTokens) {
      const re = new RegExp(`\\b${surface}\\b`, "u");
      expect(sdkJs, `sdk.js exposes: ${surface}`).toMatch(re);
      expect(text, `sdk.d.ts exposes: ${surface}`).toMatch(re);
    }
  });
});
