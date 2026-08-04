import { describe, expect, it } from "vitest";
import {
  MEMORY_PATH,
  MEMORY_SEED,
  PLAN_PATH,
  PLAN_SEED,
  formatTaskFocus,
  isWorkingMemoryPath,
  nextOpenPlanItems,
  planProgress,
  seedContentForPath,
} from "./agentWorkingMemory";

describe("agentWorkingMemory seeds", () => {
  it("exposes plan/memory seed templates", () => {
    expect(PLAN_SEED).toContain("- [ ]");
    expect(MEMORY_SEED).toContain("## Decisions");
    expect(seedContentForPath(PLAN_PATH)).toBe(PLAN_SEED);
    expect(seedContentForPath(MEMORY_PATH)).toBe(MEMORY_SEED);
    expect(seedContentForPath("README.md")).toBeNull();
  });

  it("recognizes working-memory paths", () => {
    expect(isWorkingMemoryPath(".agent/plan.md")).toBe(true);
    expect(isWorkingMemoryPath("./.agent/memory.md")).toBe(true);
    expect(isWorkingMemoryPath("index.html")).toBe(false);
  });
});

describe("plan focus helpers", () => {
  const md = `# Plan

- [x] Done one
- [ ] Open alpha
- [ ] Open beta
- [x] Done two
- [ ] Open gamma
`;

  it("lists next open items", () => {
    expect(nextOpenPlanItems(md, 2).map(i => i.text)).toEqual([
      "Open alpha",
      "Open beta",
    ]);
  });

  it("computes progress", () => {
    expect(planProgress(md)).toMatchObject({ done: 2, total: 5 });
  });

  it("formats task focus with next items + memory", () => {
    const focus = formatTaskFocus({
      planMarkdown: md,
      memoryMarkdown: "## Decisions\n- Use teal accent\n",
      openLimit: 2,
    });
    expect(focus).toContain("2/5 done");
    expect(focus).toContain("Open alpha");
    expect(focus).toContain("Open beta");
    expect(focus).not.toContain("Open gamma");
    expect(focus).toContain("teal accent");
    expect(focus).toContain("update plan checkboxes");
  });

  it("prompts to create plan when empty", () => {
    const focus = formatTaskFocus({ planMarkdown: "", memoryMarkdown: "" });
    expect(focus).toContain("write_plan");
    expect(focus).toContain("write_memory");
  });
});
