import { describe, expect, it } from "vitest";
import { formatGoBuildStamp } from "./goBuildStamp";

describe("formatGoBuildStamp", () => {
  it("formats an ISO instant in Asia/Taipei", () => {
    // 2026-08-15T05:58:00.000Z → 13:58 in Taipei (UTC+8)
    expect(formatGoBuildStamp("2026-08-15T05:58:00.000Z")).toBe(
      "2026-08-15 13:58"
    );
  });

  it("returns the raw string when the instant is invalid", () => {
    expect(formatGoBuildStamp("not-a-date")).toBe("not-a-date");
  });
});
