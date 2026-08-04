import { describe, expect, it } from "vitest";
import { isBackendRuntimeOut } from "./backendRuntimeProtocol";

describe("isBackendRuntimeOut (DEC-038 protocol guard)", () => {
  it("accepts objects with string type", () => {
    expect(isBackendRuntimeOut({ type: "ready" })).toBe(true);
    expect(
      isBackendRuntimeOut({
        type: "fsChanged",
        sandboxId: "a",
        op: "write",
        path: "x",
      })
    ).toBe(true);
    expect(isBackendRuntimeOut({ type: "envRpc", rpcId: "1" })).toBe(true);
  });

  it("rejects non-objects and mistyped payloads", () => {
    expect(isBackendRuntimeOut(null)).toBe(false);
    expect(isBackendRuntimeOut(undefined)).toBe(false);
    expect(isBackendRuntimeOut("ready")).toBe(false);
    expect(isBackendRuntimeOut(42)).toBe(false);
    expect(isBackendRuntimeOut({})).toBe(false);
    expect(isBackendRuntimeOut({ type: 1 })).toBe(false);
  });
});
