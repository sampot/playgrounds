import { describe, expect, it } from "vitest";
import {
  goPgSurfaceMetaTag,
  injectGoPgSurfaceMeta,
  normalizeGoPgSurface,
  withGoPgSurfaceQuery,
} from "./goPgSurface";

describe("goPgSurface", () => {
  it("normalizes unknown to solo", () => {
    expect(normalizeGoPgSurface("room")).toBe("room");
    expect(normalizeGoPgSurface("solo")).toBe("solo");
    expect(normalizeGoPgSurface(undefined)).toBe("solo");
    expect(normalizeGoPgSurface("x")).toBe("solo");
  });

  it("appends pg_surface to relative canvas URLs", () => {
    expect(withGoPgSurfaceQuery("/__pg_canvas__/sb/index.html?v=3", "room")).toBe(
      "/__pg_canvas__/sb/index.html?v=3&pg_surface=room"
    );
    expect(withGoPgSurfaceQuery("/__pg_canvas__/sb/index.html?v=1", "solo")).toBe(
      "/__pg_canvas__/sb/index.html?v=1&pg_surface=solo"
    );
  });

  it("injects meta into head", () => {
    const html = injectGoPgSurfaceMeta(
      "<html><head><title>x</title></head><body></body></html>",
      "room"
    );
    expect(html).toContain(goPgSurfaceMetaTag("room"));
    expect(html).toMatch(/<head[^>]*>[\s\S]*pg:surface/);
  });
});
