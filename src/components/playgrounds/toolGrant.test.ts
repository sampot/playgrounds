import { describe, expect, it } from "vitest";
import {
  assertBindingAllowed,
  assertFocusPathAllowed,
  assertPathAllowed,
  BINDINGS_DB_PATH,
  BINDINGS_DIR,
  BINDINGS_KV_PATH,
  classifyGrantPath,
  grantAllowsBinding,
  isBindingsVirtualPath,
  normalizeGrant,
  normalizeToolSession,
  pathMatchesGrant,
  ToolGrantError,
} from "./toolGrant";

describe("normalizeGrant", () => {
  it("normalizes paths and mode", () => {
    const g = normalizeGrant({
      hostSandboxId: " work-1 ",
      paths: ["./docs/a.md", "docs/a.md", "assets"],
      mode: "readwrite",
    });
    expect(g.hostSandboxId).toBe("work-1");
    expect(g.paths).toEqual(["docs/a.md", "assets"]);
    expect(g.mode).toBe("readwrite");
  });

  it("accepts virtual bindings leaves", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [BINDINGS_DB_PATH, BINDINGS_KV_PATH, "src"],
      mode: "read",
    });
    expect(g.paths).toEqual([BINDINGS_DB_PATH, BINDINGS_KV_PATH, "src"]);
  });

  it("canonicalizes legacy .bindings/d1 to .bindings/db", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [".bindings/d1"],
      mode: "read",
    });
    expect(g.paths).toEqual([BINDINGS_DB_PATH]);
  });

  it("rejects unknown .bindings/*", () => {
    try {
      normalizeGrant({
        hostSandboxId: "h",
        paths: [".bindings/secrets"],
        mode: "read",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_path");
    }
  });

  it("rejects .bindings directory alone as grant path", () => {
    try {
      normalizeGrant({
        hostSandboxId: "h",
        paths: [BINDINGS_DIR],
        mode: "read",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_path");
    }
  });

  it("rejects empty host", () => {
    expect(() =>
      normalizeGrant({ hostSandboxId: "  ", paths: ["a.md"], mode: "read" })
    ).toThrow(ToolGrantError);
    try {
      normalizeGrant({ hostSandboxId: "", paths: ["a.md"], mode: "read" });
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_grant");
    }
  });

  it("rejects empty paths", () => {
    expect(() =>
      normalizeGrant({ hostSandboxId: "h", paths: [], mode: "read" })
    ).toThrow(/paths/);
  });

  it("rejects path escape", () => {
    try {
      normalizeGrant({
        hostSandboxId: "h",
        paths: ["../outside"],
        mode: "read",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_path");
    }
  });

  it("rejects bad mode", () => {
    try {
      normalizeGrant({
        hostSandboxId: "h",
        paths: ["a.md"],
        mode: "write" as "read",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_grant");
    }
  });
});

describe("classifyGrantPath / bindings helpers", () => {
  it("classifies opfs and virtual leaves", () => {
    expect(classifyGrantPath("src/a.js")).toBe("opfs");
    expect(classifyGrantPath(BINDINGS_DB_PATH)).toBe("db");
    expect(classifyGrantPath(BINDINGS_KV_PATH)).toBe("kv");
    expect(isBindingsVirtualPath(BINDINGS_DB_PATH)).toBe(true);
    expect(isBindingsVirtualPath("src/x")).toBe(false);
  });

  it("grantAllowsBinding via exact or unrelated", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [BINDINGS_DB_PATH],
      mode: "readwrite",
    });
    expect(grantAllowsBinding(g, "db")).toBe(true);
    expect(grantAllowsBinding(g, "kv")).toBe(false);
  });
});

describe("pathMatchesGrant / assertPathAllowed", () => {
  const grant = normalizeGrant({
    hostSandboxId: "host",
    paths: ["docs/readme.md", "data"],
    mode: "read",
  });

  it("matches exact and prefix", () => {
    expect(pathMatchesGrant("docs/readme.md", grant.paths)).toBe(true);
    expect(pathMatchesGrant("data/x.csv", grant.paths)).toBe(true);
    expect(pathMatchesGrant("data", grant.paths)).toBe(true);
    expect(pathMatchesGrant("other.md", grant.paths)).toBe(false);
    expect(pathMatchesGrant("docs/other.md", grant.paths)).toBe(false);
  });

  it("allows read inside grant", () => {
    expect(assertPathAllowed(grant, "docs/readme.md", "read")).toBe(
      "docs/readme.md"
    );
    expect(assertPathAllowed(grant, "./data/a.json", "read")).toBe(
      "data/a.json"
    );
  });

  it("forbids path outside grant", () => {
    try {
      assertPathAllowed(grant, "secret.env", "read");
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("forbidden");
    }
  });

  it("forbids write when mode is read", () => {
    try {
      assertPathAllowed(grant, "docs/readme.md", "write");
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("forbidden");
    }
  });

  it("allows write when mode is readwrite", () => {
    const rw = normalizeGrant({
      hostSandboxId: "host",
      paths: ["docs/readme.md"],
      mode: "readwrite",
    });
    expect(assertPathAllowed(rw, "docs/readme.md", "write")).toBe(
      "docs/readme.md"
    );
  });

  it("rejects .. escape on assert", () => {
    try {
      assertPathAllowed(grant, "../x", "read");
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_path");
    }
  });

  it("rejects virtual path as OPFS file", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [BINDINGS_DB_PATH],
      mode: "readwrite",
    });
    try {
      assertPathAllowed(g, BINDINGS_DB_PATH, "read");
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bindings_virtual_not_file");
    }
  });
});

describe("assertBindingAllowed / assertFocusPathAllowed", () => {
  it("allows db when granted", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [BINDINGS_DB_PATH],
      mode: "readwrite",
    });
    expect(assertBindingAllowed(g, "db", "write")).toBe(BINDINGS_DB_PATH);
  });

  it("requires binding in grant", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: ["src"],
      mode: "readwrite",
    });
    try {
      assertBindingAllowed(g, "kv", "read");
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("grant_binding_required");
    }
  });

  it("focus may be virtual leaf", () => {
    const g = normalizeGrant({
      hostSandboxId: "h",
      paths: [BINDINGS_KV_PATH],
      mode: "read",
    });
    expect(assertFocusPathAllowed(g, BINDINGS_KV_PATH)).toBe(BINDINGS_KV_PATH);
  });
});

describe("normalizeToolSession", () => {
  it("builds session with optional focusPath", () => {
    const s = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: ["a.md"],
      mode: "readwrite",
      focusPath: "a.md",
    });
    expect(s.toolSandboxId).toBe("tool-1");
    expect(s.grant.hostSandboxId).toBe("host-1");
    expect(s.focusPath).toBe("a.md");
  });

  it("allows focus on .bindings/db", () => {
    const s = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: [BINDINGS_DB_PATH],
      mode: "read",
      focusPath: BINDINGS_DB_PATH,
    });
    expect(s.focusPath).toBe(BINDINGS_DB_PATH);
  });

  it("rejects tool === host", () => {
    try {
      normalizeToolSession({
        toolSandboxId: "same",
        hostSandboxId: "same",
        paths: ["a.md"],
        mode: "read",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("bad_grant");
    }
  });

  it("rejects focusPath outside grant", () => {
    try {
      normalizeToolSession({
        toolSandboxId: "tool",
        hostSandboxId: "host",
        paths: ["a.md"],
        mode: "read",
        focusPath: "b.md",
      });
      expect.fail("should throw");
    } catch (e) {
      expect((e as ToolGrantError).code).toBe("forbidden");
    }
  });
});
