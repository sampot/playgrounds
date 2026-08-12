// Phase 6 (2): sync `public/playgrounds/{sdk.js,functions-runtime.js}` to
// `go-client/static/playgrounds/`. The two Runtime shells ship the same
// SDK surface (PG-UI-SDK-SPEC G4) so a single Playgrounds contract holds
// across play.samkuo.me and go.samkuo.me.
//
// `copyGoPlaygroundsStatic` keeps the targets byte-equivalent with the
// sources, skipping a write when the file already matches and reporting
// any source that's missing. The script is wired into go-client's
// prebuild hook (see go-client/package.json). It's idempotent so calling
// it twice in a row is safe and quick.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyGoPlaygroundsStatic } from "../scripts/copy-go-playgrounds-static";

async function makeFakeRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "copy-go-pg-"));
}

async function tree(root: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, ...rel.split("/"));
    await import("node:fs/promises").then(fs => fs.mkdir(dirname(abs), { recursive: true }));
    await writeFile(abs, content, "utf8");
  }
}

describe("copyGoPlaygroundsStatic", () => {
  let root: string;

  beforeEach(async () => {
    root = await makeFakeRoot();
    await tree(root, {
      "public/playgrounds/sdk.js": "// sdk v1\n",
      "public/playgrounds/functions-runtime.js": "// helper v1\n",
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("copies SDK and helper into go-client/static/playgrounds/", async () => {
    const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    expect(report.copied).toEqual([
      "go-client/static/playgrounds/sdk.js",
      "go-client/static/playgrounds/functions-runtime.js",
    ]);
    expect(report.skipped).toEqual([]);
    expect(report.missing).toEqual([]);

    const sdk = await readFile(
      join(root, "go-client/static/playgrounds/sdk.js"),
      "utf8",
    );
    expect(sdk).toBe("// sdk v1\n");
    const helper = await readFile(
      join(root, "go-client/static/playgrounds/functions-runtime.js"),
      "utf8",
    );
    expect(helper).toBe("// helper v1\n");
  });

  it("is idempotent — second run reports skipped, no writes", async () => {
    await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    expect(report.copied).toEqual([]);
    expect(report.skipped).toEqual([
      "go-client/static/playgrounds/sdk.js",
      "go-client/static/playgrounds/functions-runtime.js",
    ]);
  });

  it("dryRun reports copied without writing files", async () => {
    const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: true });
    expect(report.copied).toEqual([
      "go-client/static/playgrounds/sdk.js",
      "go-client/static/playgrounds/functions-runtime.js",
    ]);
    await expect(
      readFile(join(root, "go-client/static/playgrounds/sdk.js"), "utf8"),
    ).rejects.toThrow();
  });

  it("reports missing when a source isn't present", async () => {
    await rm(join(root, "public/playgrounds/sdk.js"));
    const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    expect(report.missing).toContain("public/playgrounds/sdk.js");
    expect(report.copied).toEqual([
      "go-client/static/playgrounds/functions-runtime.js",
    ]);
  });

  it("overwrites stale targets when the source changes", async () => {
    await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    await writeFile(join(root, "public/playgrounds/sdk.js"), "// sdk v2\n", "utf8");
    const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun: false });
    expect(report.copied).toContain("go-client/static/playgrounds/sdk.js");
    const sdk = await readFile(
      join(root, "go-client/static/playgrounds/sdk.js"),
      "utf8",
    );
    expect(sdk).toBe("// sdk v2\n");
  });
});
