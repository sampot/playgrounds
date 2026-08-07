import { describe, expect, it } from "vitest";
import {
  findScopeGrant,
  normalizeScopeGrantEntry,
  scopeGrantAllowsPath,
  upsertScopeGrant,
} from "./scopeGrant";

describe("scopeGrant", () => {
  it("normalizes whole-tree grant", () => {
    const g = normalizeScopeGrantEntry({
      granteeSandboxId: "sam-a",
      source: "auto",
    });
    expect(g.paths).toEqual(["*"]);
    expect(g.mode).toBe("readwrite");
    expect(g.source).toBe("auto");
    expect(scopeGrantAllowsPath(g, "src/a.ts", true)).toBe(true);
  });

  it("upserts by grantee", () => {
    const a = normalizeScopeGrantEntry({
      granteeSandboxId: "a",
      paths: ["*"],
      mode: "read",
      source: "explicit",
    });
    const b = normalizeScopeGrantEntry({
      granteeSandboxId: "a",
      paths: ["src"],
      mode: "readwrite",
      source: "auto",
    });
    const next = upsertScopeGrant([a], b);
    expect(next).toHaveLength(1);
    expect(next[0]!.mode).toBe("readwrite");
    expect(findScopeGrant({ scopeGrants: next }, "a")?.paths).toContain("src");
  });

  it("path ACL respects mode", () => {
    const g = normalizeScopeGrantEntry({
      granteeSandboxId: "a",
      paths: ["*"],
      mode: "read",
      source: "explicit",
    });
    expect(scopeGrantAllowsPath(g, "readme.md", false)).toBe(true);
    expect(scopeGrantAllowsPath(g, "readme.md", true)).toBe(false);
  });
});
