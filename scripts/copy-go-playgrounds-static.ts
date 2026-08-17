#!/usr/bin/env node
/**
 * Sync `public/playgrounds/{sdk.js,sdk.d.ts,functions-runtime.js,libs/**}` →
 * `go-client/static/playgrounds/`.
 *
 * The two Runtime shells ship the same SDK, helper, types, and host libs so a
 * single Playgrounds contract holds across `play.samkuo.me` and
 * `go.samkuo.me` (PG-UI-SDK-SPEC G4 / PG-LIBS-SPEC). The sync keeps both
 * targets byte-equivalent with the sources and is idempotent.
 *
 * Shipping libs into go static ≠ SW precache (PG-LIBS-SPEC G6).
 *
 * Wired into `go-client/package.json`'s `prebuild`. Run from repo root;
 * pass `--root <path>` to override.
 */

import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export interface CopyReport {
  copied: string[];
  skipped: string[];
  missing: string[];
}

const TEXT_SOURCES: ReadonlyArray<string> = [
  "public/playgrounds/sdk.js",
  "public/playgrounds/sdk.d.ts",
  "public/playgrounds/functions-runtime.js",
];

const LIBS_DIR = "public/playgrounds/libs";

function targetFor(sourceRel: string): string {
  return sourceRel.replace(/^public\//u, "go-client/static/");
}

export interface CopyOptions {
  projectRoot: string;
  dryRun?: boolean;
}

async function listFilesRecursive(absDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const abs = join(absDir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listFilesRecursive(abs)));
    } else if (ent.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

async function copyOneText(
  projectRoot: string,
  sourceRel: string,
  dryRun: boolean | undefined,
  report: CopyReport,
): Promise<void> {
  const sourceAbs = join(projectRoot, ...sourceRel.split("/"));
  const targetRel = targetFor(sourceRel);
  const targetAbs = join(projectRoot, ...targetRel.split("/"));
  let sourceContent: string;
  try {
    sourceContent = await readFile(sourceAbs, "utf8");
  } catch {
    report.missing.push(sourceRel);
    return;
  }
  let targetContent: string | null = null;
  try {
    targetContent = await readFile(targetAbs, "utf8");
  } catch {
    targetContent = null;
  }
  if (targetContent === sourceContent) {
    report.skipped.push(targetRel);
    return;
  }
  if (!dryRun) {
    await mkdir(dirname(targetAbs), { recursive: true });
    await writeFile(targetAbs, sourceContent, "utf8");
  }
  report.copied.push(targetRel);
}

async function copyOneBinary(
  projectRoot: string,
  sourceAbs: string,
  dryRun: boolean | undefined,
  report: CopyReport,
): Promise<void> {
  const sourceRel = relative(projectRoot, sourceAbs).split("\\").join("/");
  const targetRel = targetFor(sourceRel);
  const targetAbs = join(projectRoot, ...targetRel.split("/"));
  let sourceBuf: Buffer;
  try {
    sourceBuf = await readFile(sourceAbs);
  } catch {
    report.missing.push(sourceRel);
    return;
  }
  let same = false;
  try {
    const targetBuf = await readFile(targetAbs);
    same = targetBuf.equals(sourceBuf);
  } catch {
    same = false;
  }
  if (same) {
    report.skipped.push(targetRel);
    return;
  }
  if (!dryRun) {
    await mkdir(dirname(targetAbs), { recursive: true });
    await copyFile(sourceAbs, targetAbs);
  }
  report.copied.push(targetRel);
}

export async function copyGoPlaygroundsStatic(
  opts: CopyOptions,
): Promise<CopyReport> {
  const report: CopyReport = { copied: [], skipped: [], missing: [] };
  for (const rel of TEXT_SOURCES) {
    await copyOneText(opts.projectRoot, rel, opts.dryRun, report);
  }

  const libsAbs = join(opts.projectRoot, ...LIBS_DIR.split("/"));
  let libsStat;
  try {
    libsStat = await stat(libsAbs);
  } catch {
    libsStat = null;
  }
  if (!libsStat || !libsStat.isDirectory()) {
    // Libs dir optional until Phase 1 pins land; do not fail the sync.
    return report;
  }
  const libFiles = await listFilesRecursive(libsAbs);
  // Stable order for reports / tests.
  libFiles.sort();
  for (const abs of libFiles) {
    await copyOneBinary(opts.projectRoot, abs, opts.dryRun, report);
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
