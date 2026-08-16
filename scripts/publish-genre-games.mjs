#!/usr/bin/env node
/**
 * Init git + create public sampot/pg-* remotes + push for genre backlog games.
 * Usage: node scripts/publish-genre-games.mjs [--dry-run] [--only=pg-foo,pg-bar]
 */
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { GAMES } from "./genre-backlog-manifest.mjs";

const dry = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const only = onlyArg ? new Set(onlyArg.slice(7).split(",").filter(Boolean)) : null;
const games = only ? GAMES.filter((g) => only.has(g.id)) : GAMES;

const GITIGNORE = `node_modules/
.DS_Store
coverage/
*.log
`;

function run(cwd, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    ...opts,
  });
  if (r.status !== 0 && !opts.allowFail) {
    const err = (r.stderr || r.stdout || "").trim();
    throw new Error(`${cmd} ${args.join(" ")} failed in ${cwd}: ${err}`);
  }
  return r;
}

function ensureGitignore(root) {
  const p = join(root, ".gitignore");
  if (!existsSync(p)) writeFileSync(p, GITIGNORE, "utf8");
  else {
    const cur = readFileSync(p, "utf8");
    if (!cur.includes("node_modules")) writeFileSync(p, cur + "\nnode_modules/\n", "utf8");
  }
}

async function main() {
  console.log(`publish ${games.length} games dry=${dry}`);
  const results = [];
  for (const g of games) {
    const root = join("/Users/sam/dev/sampot", g.id);
    if (!existsSync(join(root, "index.html"))) {
      results.push({ id: g.id, ok: false, error: "missing index.html" });
      continue;
    }
    try {
      ensureGitignore(root);
      if (!existsSync(join(root, ".git"))) {
        if (dry) console.log("would init", g.id);
        else run(root, "git", ["init", "-b", "main"]);
      }
      // ensure on main
      run(root, "git", ["checkout", "-B", "main"], { allowFail: true });

      if (!dry) {
        run(root, "git", ["add", "-A"]);
        const porcelain = run(root, "git", ["status", "--porcelain"]);
        if ((porcelain.stdout || "").trim()) {
          run(
            root,
            "git",
            [
              "commit",
              "-m",
              `feat: initial ${g.title} (${g.genre})`,
            ],
            {
              env: {
                ...process.env,
                GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "sampot",
                GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || "sampot@users.noreply.github.com",
                GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || "sampot",
                GIT_COMMITTER_EMAIL:
                  process.env.GIT_COMMITTER_EMAIL || "sampot@users.noreply.github.com",
              },
            },
          );
        }
        // create repo if missing
        const view = run(root, "gh", ["repo", "view", `sampot/${g.id}`, "--json", "name"], {
          allowFail: true,
        });
        if (view.status !== 0) {
          run(root, "gh", [
            "repo",
            "create",
            `sampot/${g.id}`,
            "--public",
            "--source=.",
            "--remote=origin",
            "--push",
            "--description",
            `${g.title} — ${g.blurb}`,
          ]);
        } else {
          // ensure origin + push
          const rem = run(root, "git", ["remote"], { allowFail: true });
          if (!(rem.stdout || "").includes("origin")) {
            run(root, "git", [
              "remote",
              "add",
              "origin",
              `git@github.com:sampot/${g.id}.git`,
            ]);
          }
          run(root, "git", ["push", "-u", "origin", "main"]);
        }
      }
      results.push({ id: g.id, ok: true });
      console.log("ok", g.id);
    } catch (e) {
      results.push({ id: g.id, ok: false, error: String(e.message || e) });
      console.error("FAIL", g.id, e.message || e);
    }
  }
  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ pass, fail: fail.length, fails: fail }, null, 2));
  if (fail.length) process.exit(1);
}

main();
