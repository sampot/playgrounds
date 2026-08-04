import { describe, expect, it } from "vitest";
import { META_FILENAME, peelMetaFromFileMap } from "./projectTypes";

describe("peelMetaFromFileMap", () => {
  it("strips side meta and ignores its contents", () => {
    const { files } = peelMetaFromFileMap({
      "index.html": "<!doctype html>",
      [META_FILENAME]: JSON.stringify({
        name: "Markdown 預覽",
        toolKinds: ["viewer:markdown"],
        toolGlobs: ["*.md"],
        id: "should-not-matter",
      }),
    });
    expect(files).toEqual({ "index.html": "<!doctype html>" });
    expect(files[META_FILENAME]).toBeUndefined();
  });

  it("passes through when side meta absent", () => {
    const { files } = peelMetaFromFileMap({
      "app.js": "export {}",
    });
    expect(files["app.js"]).toBe("export {}");
  });
});
