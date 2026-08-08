import { describe, expect, it } from "vitest";
import { injectGoScoreStorage } from "./goScoreStorage";

describe("injectGoScoreStorage", () => {
  it("injects catalog-scoped localStorage shim once", () => {
    const html = "<!doctype html><html><head></head><body></body></html>";
    const out = injectGoScoreStorage(html, "pg-breakout");
    expect(out).toContain("data-go-score-ns");
    expect(out).toContain("pg-go-score:pg-breakout:");
    expect(injectGoScoreStorage(out, "pg-breakout")).toBe(out);
  });
});
