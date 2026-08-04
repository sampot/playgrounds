import { describe, expect, it } from "vitest";
import {
  admitsCompute,
  capabilityLabel,
  filterKnownCapabilities,
  pendingCapabilities,
  pruneAdmittedToDeclared,
} from "./samCapabilities";
import { declaredCapabilitiesFromHtml } from "./samCapabilitiesDeclare";

describe("samCapabilities", () => {
  it("filters known tokens and drops unknown", () => {
    expect(
      filterKnownCapabilities(["runPython", "host", "runCmd", "runPython"])
    ).toEqual(["runPython", "runCmd"]);
  });

  it("computes pending and prunes admitted", () => {
    expect(pendingCapabilities(["runPython", "runCmd"], ["runPython"])).toEqual(
      ["runCmd"]
    );
    expect(
      pruneAdmittedToDeclared(["runPython"], ["runPython", "runCmd"])
    ).toEqual(["runPython"]);
  });

  it("admitsCompute when any compute token present", () => {
    expect(admitsCompute([])).toBe(false);
    expect(admitsCompute(["runPython"])).toBe(true);
    expect(admitsCompute(["runCmd"])).toBe(true);
  });

  it("labels known tokens", () => {
    expect(capabilityLabel("runPython")).toContain("Python");
  });
});

describe("declaredCapabilitiesFromHtml", () => {
  it("reads sam:capabilities", () => {
    const html = `<head>
      <meta name="sam:capabilities" content="runPython, bogus, runCmd" />
    </head>`;
    expect(declaredCapabilitiesFromHtml(html)).toEqual(["runPython", "runCmd"]);
  });
});
