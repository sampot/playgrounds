#!/usr/bin/env node
/**
 * Generate repo-root `sam-manifest.json` for catalog `kind: game` entries
 * that exist under ~/dev/sampot/<id> (or --root).
 *
 * Contract: docs/PG-GO-SAM-MANIFEST-PLAN.md / PG-GAME-AGENT-GUIDE §2.5
 *
 * Usage:
 *   node scripts/generate-sam-manifests.mjs
 *   node scripts/generate-sam-manifests.mjs --root ~/dev/sampot --dry-run
 *   node scripts/generate-sam-manifests.mjs --only pg-breakout,pg-gomoku
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLAYGROUNDS_ROOT = path.resolve(__dirname, "..");
const DEFAULT_GAMES_ROOT = path.join(
  process.env.HOME || "",
  "dev",
  "sampot"
);

const SKIP_DIR = new Set([
  ".git",
  "node_modules",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  "coverage",
  ".claude",
  ".agent",
  ".cursor",
]);

/** Docs / host-synced / non-runtime — do not list in files[] */
const SKIP_BASENAME = new Set([
  "readme.md",
  "attribution.md",
  "agents.md",
  "license",
  "license.md",
  "license.txt",
  "thumbnail.png",
  "sam-manifest.json",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "vitest.config.js",
  "vitest.config.mjs",
  "vitest.config.ts",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".ds_store",
  "changelog.md",
]);

const RUNTIME_EXT =
  /\.(?:html?|css|js|mjs|cjs|json|svg|txt|xml|csv|map|ya?ml|toml|wasm|png|jpe?g|gif|webp|ico|bmp|avif|woff2?|ttf|otf|eot|mp3|ogg|wav|m4a|aac|mp4|webm)$/iu;

function parseArgs(argv) {
  const out = {
    root: DEFAULT_GAMES_ROOT,
    dryRun: false,
    only: null,
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--force") out.force = true;
    else if (a === "--root") out.root = path.resolve(argv[++i] || "");
    else if (a === "--only") {
      out.only = new Set(
        String(argv[++i] || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      );
    }
  }
  return out;
}

function loadCatalogGameIds() {
  const entriesDir = path.join(PLAYGROUNDS_ROOT, "catalog", "entries");
  const ids = [];
  for (const name of fs.readdirSync(entriesDir)) {
    if (!name.endsWith(".yaml")) continue;
    const text = fs.readFileSync(path.join(entriesDir, name), "utf8");
    if (!/^kind:\s*game\s*$/m.test(text) && !/\nkind:\s*game\s*\n/.test(text)) {
      // also match kind: game at start or with spaces
      if (!/(?:^|\n)kind:\s*game(?:\s|$)/m.test(text)) continue;
    }
    const id = name.replace(/\.yaml$/u, "");
    ids.push(id);
  }
  return ids.sort();
}

function gitShortRev(repoDir) {
  try {
    return execFileSync("git", ["-C", repoDir, "rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function walkFiles(repoDir, rel = "") {
  const abs = rel ? path.join(repoDir, rel) : repoDir;
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const name = ent.name;
    if (name.startsWith(".") && name !== ".well-known") {
      if (SKIP_DIR.has(name)) continue;
      // skip other dotfiles at any level
      if (ent.isFile()) continue;
    }
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      if (name === "tests" || name === "__tests__") continue;
      out.push(...walkFiles(repoDir, rel ? `${rel}/${name}` : name));
      continue;
    }
    if (!ent.isFile()) continue;
    const relPath = rel ? `${rel}/${name}` : name;
    const baseLower = name.toLowerCase();
    if (SKIP_BASENAME.has(baseLower)) continue;
    if (/\.test\.[cm]?[jt]sx?$/iu.test(name)) continue;
    if (/\.spec\.[cm]?[jt]sx?$/iu.test(name)) continue;
    if (!RUNTIME_EXT.test(name) && name !== "functions.js") continue;
    // Host meta
    if (
      name === ".playgrounds-meta.json" ||
      name === ".ide-meta.json"
    ) {
      continue;
    }
    out.push(relPath.split(path.sep).join("/"));
  }
  return out;
}

function buildManifest(repoDir) {
  const files = walkFiles(repoDir).sort((a, b) => a.localeCompare(b));
  if (!files.includes("index.html")) {
    return { error: "missing index.html" };
  }
  if (files.length > 200) {
    return { error: `too many files (${files.length} > 200)` };
  }
  return {
    manifest: {
      version: 1,
      rev: gitShortRev(repoDir),
      files,
    },
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ids = loadCatalogGameIds().filter(id =>
    opts.only ? opts.only.has(id) : true
  );

  let written = 0;
  let skipped = 0;
  let missingDir = 0;
  let errors = 0;
  const errorList = [];

  for (const id of ids) {
    const repoDir = path.join(opts.root, id);
    if (!fs.existsSync(repoDir)) {
      missingDir++;
      continue;
    }
    const outPath = path.join(repoDir, "sam-manifest.json");
    if (fs.existsSync(outPath) && !opts.force) {
      skipped++;
      continue;
    }
    const result = buildManifest(repoDir);
    if (result.error) {
      errors++;
      errorList.push(`${id}: ${result.error}`);
      continue;
    }
    const body = `${JSON.stringify(result.manifest, null, 2)}\n`;
    if (opts.dryRun) {
      console.log(`[dry-run] ${id}: ${result.manifest.files.length} files rev=${result.manifest.rev}`);
    } else {
      fs.writeFileSync(outPath, body, "utf8");
      console.log(`wrote ${id} (${result.manifest.files.length} files, rev=${result.manifest.rev})`);
    }
    written++;
  }

  console.log(
    JSON.stringify(
      {
        catalogGames: ids.length,
        written,
        skippedExisting: skipped,
        missingLocalDir: missingDir,
        errors,
        dryRun: opts.dryRun,
      },
      null,
      2
    )
  );
  if (errorList.length) {
    console.error("errors:\n" + errorList.join("\n"));
    process.exitCode = 1;
  }
}

main();
