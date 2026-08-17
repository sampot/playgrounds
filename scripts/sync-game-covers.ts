/**
 * Copy game-repo root thumbnail.png → go/public /covers/<id>.png
 * then rely on catalog:gen to emit optional `cover` fields.
 *
 * Usage:
 *   npm run covers:sync
 *   npm run covers:sync -- --games-root ~/dev/sampot
 */
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCoverSync, planCoverSync } from "./catalogCover.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entriesDir = join(root, "catalog/entries");
const destDirs = [
  join(root, "go-client/static/covers"),
  join(root, "public/covers"),
];

function parseArgs(argv: string[]): { gamesRoot: string } {
  let gamesRoot = join(homedir(), "dev/sampot");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--games-root" && argv[i + 1]) {
      gamesRoot = argv[++i]!;
    }
  }
  return { gamesRoot };
}

const { gamesRoot } = parseArgs(process.argv.slice(2));
const catalogIds = readdirSync(entriesDir)
  .filter(f => f.endsWith(".yaml") && !f.startsWith("_"))
  .map(f => f.replace(/\.yaml$/, ""));

const plan = planCoverSync({ gamesRoot, catalogIds, destDirs });
if (!plan.length) {
  console.log(
    `[covers:sync] no thumbnail.png found under ${gamesRoot}/<id>/ — nothing to copy`
  );
  process.exit(0);
}

const copied = applyCoverSync(plan);
console.log(
  `[covers:sync] copied ${plan.length} cover(s) → ${destDirs.length} dest(s) (${copied} files)`
);
for (const row of plan) {
  console.log(`  ${row.id}`);
}
