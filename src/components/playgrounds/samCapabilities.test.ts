import { describe, expect, it } from "vitest";
import {
  admitsCompute,
  admitsSecretsGet,
  capabilityLabel,
  effectiveCapabilities,
  expandEffectiveCapabilities,
  filterKnownCapabilities,
  formatCapabilitiesMessage,
  hasCapability,
  pendingCapabilities,
  pruneAdmittedToDeclared,
} from "./samCapabilities";
import { declaredCapabilitiesFromHtml } from "./samCapabilitiesDeclare";

describe("samCapabilities", () => {
  it("normalizes aliases and drops unknown", () => {
    expect(
      filterKnownCapabilities(["runPython", "host", "runCmd", "runPython"])
    ).toEqual(["compute:python", "compute:cmd"]);
    expect(
      filterKnownCapabilities(["compute:python", "sandbox:edit"])
    ).toEqual(["compute:python", "sandbox:edit"]);
  });

  it("lowercases known v0 scopes", () => {
    expect(filterKnownCapabilities(["Sandbox:Edit"])).toEqual([
      "sandbox:edit",
    ]);
  });

  it("computes pending and prunes admitted with aliases", () => {
    expect(
      pendingCapabilities(["runPython", "runCmd"], ["compute:python"])
    ).toEqual(["compute:cmd"]);
    expect(
      pruneAdmittedToDeclared(["runPython"], ["compute:python", "compute:cmd"])
    ).toEqual(["compute:python"]);
  });

  it("admitsCompute when any compute token present", () => {
    expect(admitsCompute([])).toBe(false);
    expect(admitsCompute(["runPython"])).toBe(true);
    expect(admitsCompute(["compute:cmd"])).toBe(true);
  });

  it("edit implies list/read/write at gate-check without expanding store", () => {
    expect(hasCapability(["sandbox:edit"], "sandbox:list")).toBe(true);
    expect(hasCapability(["sandbox:edit"], "sandbox:read")).toBe(true);
    expect(hasCapability(["sandbox:edit"], "sandbox:write")).toBe(true);
    expect(hasCapability(["sandbox:write"], "sandbox:list")).toBe(false);
    expect(hasCapability(["sandbox:read"], "sandbox:list")).toBe(false);
    expect(filterKnownCapabilities(["sandbox:edit"])).toEqual([
      "sandbox:edit",
    ]);
    expect(expandEffectiveCapabilities(["sandbox:edit"])).toEqual([
      "sandbox:edit",
      "sandbox:list",
      "sandbox:read",
      "sandbox:write",
    ]);
  });

  it("steward effective scopes are full catalog", () => {
    const full = effectiveCapabilities({ admitted: [], isSteward: true });
    expect(full).toContain("sandbox:create");
    expect(full).toContain("secrets:get");
    expect(
      effectiveCapabilities({ admitted: ["compute:python"], isSteward: false })
    ).toEqual(["compute:python"]);
  });

  it("admitsSecretsGet", () => {
    expect(admitsSecretsGet([])).toBe(false);
    expect(admitsSecretsGet(["secrets:get"])).toBe(true);
  });

  it("labels known tokens", () => {
    expect(capabilityLabel("runPython")).toContain("Python");
    expect(capabilityLabel("sandbox:edit")).toContain("讀寫");
    expect(capabilityLabel("secrets:get")).toContain("密鑰");
    expect(capabilityLabel("secrets:get")).not.toMatch(/env\./);
  });

  it("consent copy lists capabilities without access paths", () => {
    const msg = formatCapabilitiesMessage([
      "sandbox:create",
      "secrets:get",
    ]);
    expect(msg).toContain("需要下列能力");
    expect(msg).toContain("sandbox:create");
    expect(msg).not.toMatch(/env\.HOST|env\.COMPUTE|functions\.js/);
  });
});

describe("declaredCapabilitiesFromHtml", () => {
  it("reads sam:capabilities and normalizes aliases", () => {
    const html = `<head>
      <meta name="sam:capabilities" content="runPython, bogus, sandbox:create" />
    </head>`;
    expect(declaredCapabilitiesFromHtml(html)).toEqual([
      "compute:python",
      "sandbox:create",
    ]);
  });
});
