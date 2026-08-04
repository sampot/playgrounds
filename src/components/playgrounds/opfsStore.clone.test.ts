import { describe, expect, it } from "vitest";
import { defaultCloneProjectName } from "./opfsStore";

describe("defaultCloneProjectName", () => {
  it("appends 副本 to the source name", () => {
    expect(defaultCloneProjectName("agent")).toBe("agent 副本");
  });

  it("trims and falls back when empty", () => {
    expect(defaultCloneProjectName("  ")).toBe("沙盒 副本");
    expect(defaultCloneProjectName("")).toBe("沙盒 副本");
  });
});
