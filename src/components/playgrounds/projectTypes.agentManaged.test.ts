import { describe, expect, it } from "vitest";
import { defaultMeta, isAgentManagedProject } from "./projectTypes";

describe("isAgentManagedProject", () => {
  it("is false for user projects (missing or false)", () => {
    expect(isAgentManagedProject(undefined)).toBe(false);
    expect(isAgentManagedProject(null)).toBe(false);
    expect(isAgentManagedProject(defaultMeta("a", "User"))).toBe(false);
    expect(
      isAgentManagedProject(defaultMeta("a", "User", { agentManaged: false }))
    ).toBe(false);
  });

  it("is true only when agentManaged is true", () => {
    expect(
      isAgentManagedProject(defaultMeta("a", "Agent", { agentManaged: true }))
    ).toBe(true);
  });
});
