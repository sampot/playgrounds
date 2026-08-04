/**
 * Load a SAM directory into a string FileMap (Node).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SamFileMap } from "../../sam-runtime/types.ts";

async function walk(dir: string, root: string, out: SamFileMap): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name === "node_modules" || ent.name === ".git") continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(abs, root, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const rel = relative(root, abs).replace(/\\/gu, "/");
    // Text-only for runtime MVP (controller/functions/html).
    if (!/\.(?:html?|m?js|cjs|json|css|md|txt)$/iu.test(rel)) continue;
    out[rel] = await readFile(abs, "utf8");
  }
}

export async function loadSamDir(dir: string): Promise<SamFileMap> {
  const st = await stat(dir);
  if (!st.isDirectory()) throw new Error(`not a directory: ${dir}`);
  const out: SamFileMap = {};
  await walk(dir, dir, out);
  if (!out["index.html"]) {
    throw new Error(`SAM missing index.html: ${dir}`);
  }
  return out;
}
