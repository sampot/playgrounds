/**
 * DEC-038 Phase 1: shell authority paths must not call getDirectory as sandbox root.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

const SHELL_AUTHORITY_CALLERS = [
  "shellHostBridge.ts",
  "shellToolBridge.ts",
  "computeBridge.ts",
  "PlaygroundsApp.svelte",
  "hostCheckpoint.ts",
] as const;

describe("sandbox authority boundary (DEC-038 Phase 1)", () => {
  it("shell callers import sandboxAuthority, not opfsStore", () => {
    for (const name of SHELL_AUTHORITY_CALLERS) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).toMatch(/from ["']\.\/sandboxAuthority["']/);
      expect(src, name).not.toMatch(/from ["']\.\/opfsStore["']/);
    }
  });

  it("shell callers do not call getDirectory as sandbox root", () => {
    for (const name of [
      "shellHostBridge.ts",
      "shellToolBridge.ts",
      "computeBridge.ts",
      "PlaygroundsApp.svelte",
    ] as const) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/storage\.getDirectory/);
    }
  });

  it("openFile implementation never loads authority files", () => {
    const src = readFileSync(join(here, "shellHostBridge.ts"), "utf8");
    const start = src.indexOf("async openFile(");
    const end = src.indexOf("async openTool(", start);
    const openFileFn = src.slice(start, end);
    expect(openFileFn).toMatch(/getWorkFiles/);
    expect(openFileFn).toMatch(/contentBase64|focusOnly/);
    expect(openFileFn).not.toMatch(/\bloadProjectFiles\b|\bloadTargetFiles\b/);
  });

  it("sandboxAuthority routes via Backend Runtime when live", () => {
    const src = readFileSync(join(here, "sandboxAuthority.ts"), "utf8");
    expect(src).toMatch(/isBackendRuntimeLive/);
    expect(src).toMatch(/backendFsOp/);
    expect(src).not.toMatch(
      /^export \{[^}]*saveFile[^}]*\} from ["']\.\/opfsStore["']/m
    );
  });
});
