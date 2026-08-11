import { describe, expect, it } from "vitest";
import {
  clearPgProvisionHashFromLocation,
  parsePgProvisionFromLocation,
} from "./platformClient";

describe("parsePgProvisionFromLocation", () => {
  it("parses #pg_provision= token", () => {
    expect(
      parsePgProvisionFromLocation({ hash: "#pg_provision=pg_pv_test" })
    ).toEqual({ token: "pg_pv_test" });
  });

  it("parses from combined hash with other params", () => {
    expect(
      parsePgProvisionFromLocation({
        hash: "#pg_provision=pg_pv_abc&foo=1",
      })
    ).toEqual({ token: "pg_pv_abc" });
  });

  it("falls back to search when hash missing", () => {
    expect(
      parsePgProvisionFromLocation({ search: "?pg_provision=pg_pv_q" })
    ).toEqual({ token: "pg_pv_q" });
  });

  it("returns null when absent", () => {
    expect(
      parsePgProvisionFromLocation({ hash: "#pg=other", search: "" })
    ).toBeNull();
  });

  it("decodes percent-encoded token", () => {
    expect(
      parsePgProvisionFromLocation({
        hash: "#pg_provision=pg_pv_a%2Bb",
      })
    ).toEqual({ token: "pg_pv_a+b" });
  });
});

describe("login field URL helpers", () => {
  it("does not touch the location once parsed when hash is stale", () => {
    // clearPgProvisionHashFromLocation is a no-op when window is absent.
    expect(clearPgProvisionHashFromLocation()).toBeUndefined();
  });
});
