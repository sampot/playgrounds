import { describe, expect, it } from "vitest";
import { applyUnifiedDiff, UnifiedDiffError } from "./applyUnifiedDiff";
import { simpleUnifiedDiff } from "./agentUx";

describe("applyUnifiedDiff", () => {
  it("applies a simpleUnifiedDiff round-trip", () => {
    const before = "export function add(a, b) {\n  return a + b + 1;\n}\n";
    const after = "export function add(a, b) {\n  return a + b;\n}\n";
    const diff = simpleUnifiedDiff(before, after, "src/demo.js");
    expect(applyUnifiedDiff(before, diff)).toBe(after);
  });

  it("rejects mismatched context", () => {
    const before = "a\nb\n";
    const diff = ["--- a/x", "+++ b/x", "@@", " a", "-z", "+c"].join("\n");
    expect(() => applyUnifiedDiff(before, diff)).toThrow(UnifiedDiffError);
  });
});
