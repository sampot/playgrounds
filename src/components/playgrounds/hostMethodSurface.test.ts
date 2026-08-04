import { describe, expect, it } from "vitest";
import { HOST_CAPABILITIES } from "./hostCapabilities";
import {
  HOST_LOCAL_METHODS,
  HOST_SHELL_METHODS,
  hostMethodSurface,
  isHostLocalMethod,
  isHostShellMethod,
} from "./hostMethodSurface";

describe("hostMethodSurface", () => {
  it("classifies openFile as shell (terminal)", () => {
    expect(hostMethodSurface("openFile")).toBe("shell");
    expect(isHostShellMethod("openFile")).toBe(true);
    expect(isHostLocalMethod("openFile")).toBe(false);
  });

  it("classifies readFile／writeFile as local", () => {
    expect(hostMethodSurface("readFile")).toBe("local");
    expect(hostMethodSurface("writeFile")).toBe("local");
    expect(isHostLocalMethod("readFile")).toBe(true);
  });

  it("covers every HOST capability token", () => {
    const classified = new Set<string>([
      ...HOST_LOCAL_METHODS,
      ...HOST_SHELL_METHODS,
    ]);
    // capabilities() lists feature tokens; map aliases to methods where needed.
    const aliases: Record<string, string> = {
      expectedHash: "writeFile",
      mainTabs: "listMainTabs",
      agentMailbox: "capabilities",
      agentLeader: "capabilities",
      agentRegistry: "capabilities",
    };
    for (const cap of HOST_CAPABILITIES) {
      const method = aliases[cap] ?? cap;
      expect(
        classified.has(method) || hostMethodSurface(method) !== null,
        `capability ${cap} → ${method} should be classified`
      ).toBe(true);
    }
  });

  it("has no local／shell overlap", () => {
    const overlap = HOST_LOCAL_METHODS.filter(m =>
      (HOST_SHELL_METHODS as readonly string[]).includes(m)
    );
    expect(overlap).toEqual([]);
  });

  it("FS authority methods used by Runtime stay local not shell", () => {
    for (const m of [
      "readFile",
      "writeFile",
      "writeFileBase64",
      "mkdir",
      "remove",
      "listDir",
      "listFiles",
      "readFileBase64",
    ] as const) {
      expect(hostMethodSurface(m), m).toBe("local");
    }
  });
});
