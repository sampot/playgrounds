import { describe, expect, it } from "vitest";
import { hashUtf8 } from "./contentHash";

describe("hashUtf8", () => {
  it("is stable for the same input", async () => {
    const a = await hashUtf8("hello");
    const b = await hashUtf8("hello");
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  it("differs for different inputs", async () => {
    expect(await hashUtf8("a")).not.toBe(await hashUtf8("b"));
  });
});
