import { describe, expect, it } from "vitest";
import {
  completeShellLine,
  listPathEntries,
  tokenAtCursor,
} from "./shellComplete";

describe("shellComplete", () => {
  it("finds token at cursor", () => {
    expect(tokenAtCursor("jq da", 5)).toEqual({
      start: 3,
      end: 5,
      token: "da",
    });
    expect(tokenAtCursor("ec", 2)).toEqual({
      start: 0,
      end: 2,
      token: "ec",
    });
  });

  it("lists path entries under cwd", () => {
    const files = {
      "a.json": "{}",
      "src/b.ts": "",
      "src/lib/c.ts": "",
    };
    expect(listPathEntries(files, "")).toEqual(["a.json", "src/"]);
    expect(listPathEntries(files, "src")).toEqual(["b.ts", "lib/"]);
  });

  it("completes command names", () => {
    const r = completeShellLine({
      line: "ec",
      cursor: 2,
      cwd: "",
      files: {},
      commands: ["echo", "env", "export", "cat"],
    });
    expect(r).toEqual({ kind: "apply", line: "echo ", cursor: 5 });
  });

  it("lists multiple command matches", () => {
    const r = completeShellLine({
      line: "e",
      cursor: 1,
      cwd: "",
      files: {},
      commands: ["echo", "env", "export", "cat"],
    });
    expect(r.kind).toBe("list");
    if (r.kind === "list") {
      expect(r.matches).toEqual(["echo", "env", "export"]);
    }
  });

  it("completes paths and dirs with trailing slash", () => {
    const files = {
      "readme.md": "",
      "src/main.ts": "",
    };
    const one = completeShellLine({
      line: "cat re",
      cursor: 6,
      cwd: "",
      files,
      commands: ["cat"],
    });
    expect(one).toEqual({
      kind: "apply",
      line: "cat readme.md ",
      cursor: 14,
    });

    const dir = completeShellLine({
      line: "ls s",
      cursor: 4,
      cwd: "",
      files,
      commands: ["ls"],
    });
    expect(dir).toEqual({ kind: "apply", line: "ls src/", cursor: 7 });
  });
});
