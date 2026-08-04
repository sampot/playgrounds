import { describe, expect, it } from "vitest";
import {
  replProjectBytesToText,
  replProjectTextToBytes,
} from "./replOpfsProject";

describe("replOpfsProject helpers", () => {
  it("round-trips utf-8 text bytes", () => {
    const text = "hello 世界\n";
    const bytes = replProjectTextToBytes(text);
    expect(replProjectBytesToText(bytes)).toBe(text);
  });
});
