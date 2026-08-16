#!/usr/bin/env node
/**
 * Write catalog/entries/*.yaml for genre-coverage backlog games.
 * Usage: node --experimental-strip-types scripts/write-genre-catalog.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "./genre-backlog-manifest.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = join(root, "catalog/entries");
mkdirSync(entries, { recursive: true });

for (const g of GAMES) {
  const body = `title: ${g.title}
kind: game
series: ${g.series}
blurb: ${g.blurb}
source: sampot/${g.id}
license: MIT
status: unlisted
`;
  writeFileSync(join(entries, `${g.id}.yaml`), body, "utf8");
  console.log("wrote", g.id);
}
console.log("done", GAMES.length);
