#!/usr/bin/env node
/**
 * Commit + push sam-manifest.json for each catalog kind:game under ~/dev/sampot/<id>.
 *
 *   node scripts/push-sam-manifests.mjs
 *   node scripts/push-sam-manifests.mjs --jobs 4
 *   node scripts/push-sam-manifests.mjs --only pg-breakout
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const PLAY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.GAMES_ROOT || path.join(homedir(), "dev", "sampot");
const MSG =
  process.env.COMMIT_MSG ||
  "chore: add sam-manifest.json for go download list";

function parseArgs(argv) {
  let jobs = 4;
  let only = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--jobs") jobs = Math.max(1, Number(argv[++i]) || 1);
    else if (argv[i] === "--only") {
      only = new Set(
        String(argv[++i] || "")
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
      );
    }
  }
  return { jobs, only };
}

function catalogGameIds() {
  const dir = path.join(PLAY, "catalog", "entries");
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".yaml"))
    .map(f => f.replace(/\.yaml$/u, ""))
    .filter(id => {
      const t = fs.readFileSync(path.join(dir, `${id}.yaml`), "utf8");
      return /(?:^|\n)kind:\s*game(?:\s|$)/m.test(t);
    })
    .sort();
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => {
      stdout += d;
    });
    child.stderr.on("data", d => {
      stderr += d;
    });
    child.on("error", reject);
    child.on("close", code => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function porcelain(dir) {
  try {
    return execFileSync(
      "git",
      ["-C", dir, "status", "--porcelain", "--", "sam-manifest.json"],
      { encoding: "utf8" }
    ).trim();
  } catch {
    return "";
  }
}

async function commitOne(id) {
  const dir = path.join(ROOT, id);
  const file = path.join(dir, "sam-manifest.json");
  if (!fs.existsSync(file)) return { id, status: "skip", reason: "no-file" };
  if (!porcelain(dir)) return { id, status: "skip", reason: "clean" };

  let r = await run("git", ["add", "--", "sam-manifest.json"], dir);
  if (r.code !== 0) {
    return { id, status: "fail", reason: `add: ${r.stderr || r.stdout}` };
  }
  r = await run("git", ["commit", "-m", MSG], dir);
  if (r.code !== 0) {
    return { id, status: "fail", reason: `commit: ${r.stderr || r.stdout}` };
  }
  r = await run("git", ["push", "-u", "origin", "HEAD"], dir);
  if (r.code !== 0) {
    return { id, status: "fail", reason: `push: ${r.stderr || r.stdout}` };
  }
  return { id, status: "ok" };
}

async function mapPool(items, concurrency, fn) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

async function main() {
  const { jobs, only } = parseArgs(process.argv.slice(2));
  let ids = catalogGameIds();
  if (only) ids = ids.filter(id => only.has(id));

  console.log(`repos=${ids.length} jobs=${jobs} root=${ROOT}`);
  const results = await mapPool(ids, jobs, commitOne);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  const fails = [];
  for (const r of results) {
    if (r.status === "ok") {
      ok++;
      console.log(`OK ${r.id}`);
    } else if (r.status === "skip") {
      skip++;
    } else {
      fail++;
      fails.push(r);
      console.error(`FAIL ${r.id}: ${r.reason}`);
    }
  }
  console.log(JSON.stringify({ ok, skip, fail, total: ids.length }, null, 2));
  if (fail) process.exitCode = 1;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
