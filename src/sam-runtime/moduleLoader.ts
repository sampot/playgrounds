/**
 * Load ESM entry modules from an in-memory SAM file map (Node / Vitest).
 * Writes a temp tree so relative imports resolve.
 */

import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import type { LoadedEsmModule, SamFileMap } from "./types.ts";

export type { LoadedEsmModule, SamEsmLoader } from "./types.ts";

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\.\//u, "")
    .replace(/^\/+/u, "");
}

function isJsPath(path: string): boolean {
  return /\.(?:m?js|cjs)$/iu.test(path);
}

/**
 * Persist text JS files under a temp directory and dynamic-import `entryPath`.
 */
export async function loadEsmFromFileMap<T = unknown>(
  files: SamFileMap,
  entryPath: string
): Promise<LoadedEsmModule<T> | null> {
  const entry = normalizePath(entryPath);
  const source = files[entry];
  if (typeof source !== "string") return null;

  const root = await mkdtemp(join(tmpdir(), "sam-runtime-"));
  try {
    for (const [rawPath, content] of Object.entries(files)) {
      const path = normalizePath(rawPath);
      if (!isJsPath(path) || typeof content !== "string") continue;
      const abs = join(root, ...path.split("/"));
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content, "utf8");
    }
    const entryAbs = join(root, ...entry.split("/"));
    const mod = (await import(
      /* @vite-ignore */ pathToFileURL(entryAbs).href
    )) as T;
    return {
      exports: mod,
      async dispose() {
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (e) {
    await rm(root, { recursive: true, force: true });
    throw e;
  }
}
