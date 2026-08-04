import { describe, expect, it } from "vitest";
import { formatPlaygroundsBuiltAt } from "./playgroundsBuildInfo";

describe("formatPlaygroundsBuiltAt", () => {
  it("formats UTC ISO as Taipei wall clock", () => {
    // 2026-08-03T11:29:00Z → 19:29 Asia/Taipei
    expect(formatPlaygroundsBuiltAt("2026-08-03T11:29:00.000Z")).toBe(
      "2026-08-03 19:29"
    );
  });

  it("returns the input when unparseable", () => {
    expect(formatPlaygroundsBuiltAt("not-a-date")).toBe("not-a-date");
  });
});
