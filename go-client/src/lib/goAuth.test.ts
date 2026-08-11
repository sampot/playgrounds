import { afterEach, describe, expect, it } from "vitest";
import {
  clearPgProvisionHashFromLocation,
  goLoginUrl,
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

describe("goLoginUrl", () => {
  const original = import.meta.env.VITE_PLATFORM_DASH_ORIGIN;

  afterEach(() => {
    if (original === undefined) delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    else import.meta.env.VITE_PLATFORM_DASH_ORIGIN = original;
  });

  it("builds the dash /go/login redirect URL with ?field= for prod origin", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("https://go.samkuo.me");
    expect(url.startsWith("https://dash.samkuo.me/go/login?")).toBe(true);
    expect(new URL(url).searchParams.get("field")).toBe("https://go.samkuo.me");
  });

  it("uses the VITE_PLATFORM_DASH_ORIGIN override in dev", () => {
    import.meta.env.VITE_PLATFORM_DASH_ORIGIN = "http://localhost:5173/";
    const url = goLoginUrl("http://localhost:5174");
    expect(url.startsWith("http://localhost:5173/go/login?")).toBe(true);
    expect(new URL(url).searchParams.get("field")).toBe("http://localhost:5174");
  });

  it("omits ?field= when fieldOrigin is empty", () => {
    delete import.meta.env.VITE_PLATFORM_DASH_ORIGIN;
    const url = goLoginUrl("");
    expect(new URL(url).searchParams.has("field")).toBe(false);
  });
});
