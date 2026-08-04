import { describe, expect, it } from "vitest";
import { CODING_ORCH_DEMO_PATH } from "./codingOrchestrationApi";
import {
  buildCodingWorkerUserPrompt,
  codingWorkerRuleFix,
  parseCodingWorkerLlmEdits,
} from "./codingOrchestrationLlm";

describe("codingOrchestrationLlm", () => {
  it("rule fix removes off-by-one", () => {
    const before = `export function add(a, b) {\n  return a + b + 1; // bug: off-by-one\n}\n`;
    expect(codingWorkerRuleFix(before)).toContain("return a + b;");
    expect(codingWorkerRuleFix(before)).not.toContain("+ 1");
  });

  it("parses write edits and strips fences", () => {
    const content = "export function add(a, b) {\n  return a + b;\n}\n";
    const text = [
      "```json",
      JSON.stringify({
        summary: "fixed",
        edits: [{ path: CODING_ORCH_DEMO_PATH, kind: "write", content }],
      }),
      "```",
    ].join("\n");
    const parsed = parseCodingWorkerLlmEdits(text);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.summary).toBe("fixed");
    expect(parsed.edits[0]).toMatchObject({
      path: CODING_ORCH_DEMO_PATH,
      kind: "write",
      content,
    });
  });

  it("rejects disallowed paths", () => {
    const parsed = parseCodingWorkerLlmEdits(
      JSON.stringify({
        summary: "x",
        edits: [{ path: ".agent/plan.md", kind: "write", content: "no" }],
      })
    );
    expect(parsed).toMatchObject({ code: "edit_path_forbidden" });
  });

  it("builds user prompt with file body", () => {
    const p = buildCodingWorkerUserPrompt({
      taskId: "t1",
      brief: "fix add",
      path: CODING_ORCH_DEMO_PATH,
      content: "code",
    });
    expect(p).toContain("taskId: t1");
    expect(p).toContain("code");
  });
});
