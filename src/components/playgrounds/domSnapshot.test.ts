import { describe, expect, it } from "vitest";
import {
  clampDomSnapshotMaxChars,
  DOM_SNAPSHOT_DEFAULT_MAX,
  DOM_SNAPSHOT_HARD_MAX,
  DOM_SNAPSHOT_HARD_MIN,
  truncateDomSnapshot,
} from "./domSnapshot";

describe("domSnapshot helpers", () => {
  it("clamps maxChars", () => {
    expect(clampDomSnapshotMaxChars(undefined)).toBe(DOM_SNAPSHOT_DEFAULT_MAX);
    expect(clampDomSnapshotMaxChars(10)).toBe(DOM_SNAPSHOT_HARD_MIN);
    expect(clampDomSnapshotMaxChars(999_999)).toBe(DOM_SNAPSHOT_HARD_MAX);
  });

  it("truncates long text", () => {
    const long = "x".repeat(300);
    const out = truncateDomSnapshot(long, 256);
    expect(out.truncated).toBe(true);
    expect(out.text.endsWith("…[truncated]")).toBe(true);
    expect(out.text.length).toBeLessThanOrEqual(256 + "…[truncated]".length);
  });

  it("passes short text through", () => {
    const out = truncateDomSnapshot("hi", 1000);
    expect(out).toEqual({ text: "hi", truncated: false });
  });
});
