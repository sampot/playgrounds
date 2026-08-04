import { describe, expect, it } from "vitest";
import {
  applySamHeadToolFields,
  projectToolFieldsFromFiles,
  projectToolFieldsFromHtml,
} from "./samHeadProjectMeta";
import type { ProjectMeta } from "./projectTypes";

describe("projectToolFieldsFromHtml", () => {
  it("reads sam:tool-kinds and sam:tool-globs", () => {
    expect(
      projectToolFieldsFromHtml(`<!doctype html><html><head>
        <title>Markdown 預覽</title>
        <meta name="sam:tool-kinds" content="viewer:markdown" />
        <meta name="sam:tool-globs" content="*.md, *.markdown" />
      </head><body></body></html>`)
    ).toEqual({
      toolKinds: ["viewer:markdown"],
      toolGlobs: ["*.md", "*.markdown"],
    });
  });

  it("returns empty object when tags absent", () => {
    expect(
      projectToolFieldsFromHtml(
        `<!doctype html><html><head><title>X</title></head></html>`
      )
    ).toEqual({});
  });
});

describe("projectToolFieldsFromFiles", () => {
  it("uses index.html only", () => {
    expect(
      projectToolFieldsFromFiles({
        "index.html": `<head><meta name="sam:tool-globs" content="*.svg" /></head>`,
        "app.js": "export {}",
      })
    ).toEqual({ toolGlobs: ["*.svg"] });
  });

  it("returns null without index.html text", () => {
    expect(projectToolFieldsFromFiles({ "app.js": "x" })).toBeNull();
  });
});

describe("applySamHeadToolFields", () => {
  const base: ProjectMeta = {
    id: "p1",
    name: "n",
    entry: "index.html",
    createdAt: "t",
    updatedAt: "t",
    toolKinds: ["editor:text"],
    toolGlobs: ["*.txt"],
  };

  it("overwrites mirror from head and clears when tags removed", () => {
    expect(
      applySamHeadToolFields(
        base,
        `<head><meta name="sam:tool-kinds" content="viewer:markdown" /></head>`
      )
    ).toMatchObject({
      toolKinds: ["viewer:markdown"],
      toolGlobs: undefined,
    });
  });
});
