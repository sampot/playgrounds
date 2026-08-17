import { describe, expect, it } from "vitest";
import {
  parseSamManifestJson,
  isValidSamManifestPath,
} from "./samManifest";

describe("isValidSamManifestPath", () => {
  it("accepts relative repo paths", () => {
    expect(isValidSamManifestPath("index.html")).toBe(true);
    expect(isValidSamManifestPath("assets/foo.png")).toBe(true);
  });

  it("rejects absolute, parent, and empty segments", () => {
    expect(isValidSamManifestPath("/index.html")).toBe(false);
    expect(isValidSamManifestPath("../x")).toBe(false);
    expect(isValidSamManifestPath("a/../b")).toBe(false);
    expect(isValidSamManifestPath("")).toBe(false);
    expect(isValidSamManifestPath("a//b")).toBe(false);
  });
});

describe("parseSamManifestJson", () => {
  it("parses a valid v1 manifest", () => {
    expect(
      parseSamManifestJson(
        JSON.stringify({
          version: 1,
          rev: "abc123",
          files: ["index.html", "app.js"],
        })
      )
    ).toEqual({
      version: 1,
      rev: "abc123",
      files: ["index.html", "app.js"],
    });
  });

  it("rejects missing index.html", () => {
    expect(() =>
      parseSamManifestJson(
        JSON.stringify({ version: 1, rev: "1", files: ["app.js"] })
      )
    ).toThrow(/index\.html/);
  });

  it("rejects unknown contract version", () => {
    expect(() =>
      parseSamManifestJson(
        JSON.stringify({ version: 2, rev: "1", files: ["index.html"] })
      )
    ).toThrow(/契約版/);
  });

  it("rejects duplicate paths", () => {
    expect(() =>
      parseSamManifestJson(
        JSON.stringify({
          version: 1,
          rev: "1",
          files: ["index.html", "index.html"],
        })
      )
    ).toThrow(/重複/);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseSamManifestJson("{")).toThrow(/JSON/);
  });
});
