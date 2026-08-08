/**
 * Copy sql.js WASM (and browser glue for optional direct loads) into static/vendor
 * so env.DB can locateFile same-origin and SW can offline-cache (network-first).
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "node_modules", "sql.js", "dist");
const outDir = path.join(root, "static", "vendor", "sql.js");

const files = [
  "sql-wasm-browser.wasm",
  "sql-wasm.wasm",
  // Optional same-origin glue if something loads /vendor directly (primary = Vite dynamic import).
  "sql-wasm-browser.js",
  "sql-wasm.js",
];

if (!existsSync(dist)) {
  console.error("[vendor-sqljs] missing node_modules/sql.js — run npm install in go-client");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const name of files) {
  const src = path.join(dist, name);
  if (!existsSync(src)) {
    console.warn(`[vendor-sqljs] skip missing ${name}`);
    continue;
  }
  copyFileSync(src, path.join(outDir, name));
  console.log(`[vendor-sqljs] ${name}`);
}
