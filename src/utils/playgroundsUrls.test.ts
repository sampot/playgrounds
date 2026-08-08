import { describe, expect, it } from "vitest";
import {
  PLAYGROUNDS_GO_ORIGIN,
  goSamShareHref,
} from "./playgroundsUrls";

describe("goSamShareHref", () => {
  it("builds canonical /s/<id> on go origin", () => {
    expect(goSamShareHref("pg-breakout")).toBe(
      `${PLAYGROUNDS_GO_ORIGIN}/s/pg-breakout`
    );
  });

  it("encodes id and strips trailing slash on origin", () => {
    expect(goSamShareHref("a/b", "https://go.example.test/")).toBe(
      "https://go.example.test/s/a%2Fb"
    );
  });

  it("rejects empty id", () => {
    expect(() => goSamShareHref("  ")).toThrow(/型錄 id/);
  });
});
