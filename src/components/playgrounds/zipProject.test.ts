import { describe, expect, it } from "vitest";
import { defaultMeta } from "./projectTypes";
import {
  filesToZip,
  isSamFilename,
  withSamExtension,
  zipToFiles,
} from "./zipProject";

describe("zipProject", () => {
  it("recognizes .sam package names", () => {
    expect(isSamFilename("Demo.sam")).toBe(true);
    expect(isSamFilename("Demo.SAM")).toBe(true);
    expect(isSamFilename("Demo.zip")).toBe(false);
    expect(withSamExtension("Demo")).toBe("Demo.sam");
    expect(withSamExtension("Demo.sam")).toBe("Demo.sam");
    expect(withSamExtension("Demo.zip")).toBe("Demo.sam");
  });

  it("round-trips files and meta", () => {
    const meta = defaultMeta("p1", "Demo");
    const files = {
      "index.html": "<!doctype html><title>x</title>",
      "main.js": "console.log(1)",
    };
    const zip = filesToZip(files, meta, { folderName: "Demo" });
    const restored = zipToFiles(zip);
    expect(restored.files["index.html"]).toContain("<!doctype html>");
    expect(restored.files["main.js"]).toBe("console.log(1)");
    expect(restored.meta.name).toBe("Demo");
    expect(restored.meta.entry).toBe("index.html");
  });

  it("round-trips binary files", () => {
    const meta = defaultMeta("p2", "Bin");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    const files = {
      "index.html": "<!doctype html>",
      "logo.png": png,
    };
    const zip = filesToZip(files, meta, { folderName: "Bin" });
    const restored = zipToFiles(zip);
    expect(restored.files["index.html"]).toBe("<!doctype html>");
    expect(restored.files["logo.png"]).toBeInstanceOf(Uint8Array);
    expect([...(restored.files["logo.png"] as Uint8Array)]).toEqual([...png]);
  });

  it("ignores toolKinds／toolGlobs from package side meta", () => {
    const meta = defaultMeta("p3", "Toolish", {
      toolKinds: ["viewer:markdown"],
      toolGlobs: ["*.md"],
    });
    const files = {
      "index.html": `<!doctype html><html><head>
        <title>From Head</title>
        <meta name="sam:tool-kinds" content="viewer:markdown" />
      </head></html>`,
    };
    const zip = filesToZip(files, meta, { folderName: "Toolish" });
    const restored = zipToFiles(zip);
    expect(restored.meta.toolKinds).toBeUndefined();
    expect(restored.meta.toolGlobs).toBeUndefined();
    expect(restored.files[".playgrounds-meta.json"]).toBeUndefined();
  });
});
