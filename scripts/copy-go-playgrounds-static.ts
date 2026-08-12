#!/usr/bin/env node
/**
 * Sync `public/playgrounds/{sdk.js,functions-runtime.js}` →
 * `go-client/static/playgrounds/`.
 *
 * The two Runtime shells ship the same SDK and helper so a single
 * Playgrounds contract holds across `play.samkuo.me` and `go.samkuo.me`
 * (PG-UI-SDK-SPEC G4). The sync keeps both targets byte-equivalent with
 * the sources and is idempotent: re-running on an up-to-date tree is a
 * no-op (no FS writes).
 *
 * Wired into `go-client/package.json`'s `prebuild` so every go build
 * pulls the latest SDK. Intended to be run from the playgrounds repo
 * root; pass `--root <path>` to override.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CopyReport {
  copied: string[];
  skipped: string[];
  missing: string[];
}

const SOURCES: ReadonlyArray<string> = [
  "public/playgrounds/sdk.js",
  "public/playgrounds/functions-runtime.js",
];

function targetFor(sourceRel: string): string {
  // Mirror the path under go-client/static/. We keep the
  // `playgrounds/<name>` directory layout so the runtime URL contract
  // (`/playgrounds/sdk.js`, `/playgrounds/functions-runtime.js`) is
  // identical on both shells.
  return sourceRel.replace(/^public\//u, "go-client/static/");
}

export interface CopyOptions {
  projectRoot: string;
  dryRun?: boolean;
}

export async function copyGoPlaygroundsStatic(
  opts: CopyOptions,
): Promise<CopyReport> {
  const report: CopyReport = { copied: [], skipped: [], missing: [] };
  for (const rel of SOURCES) {
    const sourceAbs = join(opts.projectRoot, ...rel.split("/"));
    const targetRel = targetFor(rel);
    const targetAbs = join(opts.projectRoot, ...targetRel.split("/"));
    let sourceContent: string;
    try {
      sourceContent = await readFile(sourceAbs, "utf8");
    } catch {
      report.missing.push(rel);
      continue;
    }
    let targetContent: string | null = null;
    try {
      targetContent = await readFile(targetAbs, "utf8");
    } catch {
      targetContent = null;
    }
    if (targetContent === sourceContent) {
      report.skipped.push(targetRel);
      continue;
    }
    if (!opts.dryRun) {
      await mkdir(dirname(targetAbs), { recursive: true });
      await writeFile(targetAbs, sourceContent, "utf8");
    }
    report.copied.push(targetRel);
  }
  return report;
}

function parseArgs(argv: ReadonlyArray<string>): { root: string; dryRun: boolean } {
  let root = process.cwd();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") {
      root = argv[i + 1] ?? root;
      i++;
    } else if (a === "--dry-run") {
      dryRun = true;
    }
  }
  return { root, dryRun };
}

async function main(): Promise<void> {
  const { root, dryRun } = parseArgs(process.argv.slice(2));
  const report = await copyGoPlaygroundsStatic({ projectRoot: root, dryRun });
  for (const path of report.copied) {
    process.stdout.write(`copied  ${path}\n`);
  }
  for (const path of report.skipped) {
    process.stdout.write(`skipped ${path}\n`);
  }
  for (const path of report.missing) {
    process.stderr.write(`missing ${path}\n`);
  }
  if (report.missing.length > 0) {
    process.exit(1);
  }
}

const isEntry = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isEntry) {
  void main();
}
