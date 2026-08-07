import { describe, expect, it } from "vitest";
import {
  clearPgProvisionHashFromLocation,
  parsePgProvisionFromLocation,
} from "./platformProvisionUrl";

describe("platformProvisionUrl", () => {
  it("parses #pg_provision= token", () => {
    const parsed = parsePgProvisionFromLocation({
      hash: "#pg_provision=pg_pv_test",
    });
    expect(parsed).toEqual({ token: "pg_pv_test" });
  });

  it("clear is noop without window hash match", () => {
    expect(() => clearPgProvisionHashFromLocation()).not.toThrow();
  });
});
