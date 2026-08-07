import { describe, expect, it } from "vitest";
import {
  admitsHostBinding,
  grantModeForScopes,
  hasSandboxFsScope,
  methodAllowedByScopes,
  methodsForScopes,
} from "./hostScopeMap";
import { createScopedHostBinding } from "./scopedHostBinding";

describe("hostScopeMap", () => {
  it("projects sandbox:edit to list/read/write methods", () => {
    const methods = methodsForScopes(["sandbox:edit"]);
    expect(methods).toContain("listDir");
    expect(methods).toContain("readFile");
    expect(methods).toContain("writeFile");
    expect(methods).not.toContain("createProject");
    expect(methodAllowedByScopes("createProject", ["sandbox:edit"])).toBe(
      false
    );
  });

  it("write alone does not allow listDir or readFile", () => {
    expect(methodAllowedByScopes("listDir", ["sandbox:write"])).toBe(false);
    expect(methodAllowedByScopes("readFile", ["sandbox:write"])).toBe(false);
    expect(methodAllowedByScopes("writeFile", ["sandbox:write"])).toBe(true);
  });

  it("secrets:get alone does not admit HOST binding", () => {
    expect(admitsHostBinding(["secrets:get"])).toBe(false);
    expect(admitsHostBinding(["compute:python"])).toBe(true);
  });

  it("grantModeForScopes mirrors write strength", () => {
    expect(grantModeForScopes(["sandbox:edit"])).toBe("readwrite");
    expect(grantModeForScopes(["sandbox:read"])).toBe("read");
    expect(grantModeForScopes(["compute:python"])).toBe(null);
  });

  it("hasSandboxFsScope respects edit implication", () => {
    expect(hasSandboxFsScope(["sandbox:edit"], "list")).toBe(true);
    expect(hasSandboxFsScope(["sandbox:write"], "list")).toBe(false);
  });
});

describe("createScopedHostBinding", () => {
  it("exposes subset capabilities and omits unauthorized methods", async () => {
    const full = {
      apiVersion: async () => "1",
      capabilities: async () => ["listDir", "writeFile", "createProject"],
      listDir: async () => [],
      writeFile: async () => {},
      createProject: async () => ({ id: "x" }),
    };
    const host = createScopedHostBinding(full, {
      effectiveScopes: ["sandbox:write"],
    });
    expect(typeof host.writeFile).toBe("function");
    expect(host.listDir).toBeUndefined();
    expect(host.createProject).toBeUndefined();
    const caps = await (host.capabilities as () => Promise<string[]>)();
    expect(caps).toContain("writeFile");
    expect(caps).not.toContain("listDir");
    expect(await (host.listAdmittedScopes as () => Promise<string[]>)()).toEqual(
      ["sandbox:write"]
    );
  });
});
