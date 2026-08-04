import { describe, expect, it } from "vitest";
import { defaultMeta } from "./projectTypes";
import {
  isInWorkingSet,
  isRecyclableSandbox,
  listWorkingSet,
} from "./workingSet";

describe("isInWorkingSet", () => {
  it("treats missing field on user projects as true", () => {
    expect(isInWorkingSet(defaultMeta("a", "User"))).toBe(true);
    expect(
      isInWorkingSet(defaultMeta("a", "User", { agentManaged: false }))
    ).toBe(true);
  });

  it("treats missing field on agentManaged as false", () => {
    expect(
      isInWorkingSet(defaultMeta("a", "Agent", { agentManaged: true }))
    ).toBe(false);
  });

  it("honors explicit inWorkingSet over agentManaged", () => {
    expect(
      isInWorkingSet(
        defaultMeta("a", "Kept", { agentManaged: true, inWorkingSet: true })
      )
    ).toBe(true);
    expect(
      isInWorkingSet(
        defaultMeta("a", "Hidden", { agentManaged: false, inWorkingSet: false })
      )
    ).toBe(false);
  });

  it("is false for null/undefined", () => {
    expect(isInWorkingSet(undefined)).toBe(false);
    expect(isInWorkingSet(null)).toBe(false);
  });
});

describe("listWorkingSet", () => {
  it("filters to working-set members", () => {
    const user = defaultMeta("u", "User");
    const agentHidden = defaultMeta("h", "Hidden", { agentManaged: true });
    const agentShown = defaultMeta("s", "Shown", {
      agentManaged: true,
      inWorkingSet: true,
    });
    expect(listWorkingSet([user, agentHidden, agentShown])).toEqual([
      user,
      agentShown,
    ]);
  });
});

describe("isRecyclableSandbox", () => {
  it("is true only for agentManaged outside working set and not active steward", () => {
    const recycle = defaultMeta("r", "Clone", {
      agentManaged: true,
      inWorkingSet: false,
    });
    expect(isRecyclableSandbox(recycle, "steward")).toBe(true);
    expect(isRecyclableSandbox(recycle, "r")).toBe(false);
    expect(
      isRecyclableSandbox(
        defaultMeta("u", "User", { inWorkingSet: true }),
        null
      )
    ).toBe(false);
  });
});
