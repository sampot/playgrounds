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
 * Map of absolute path specifiers (e.g. `/playgrounds/functions-runtime.js`)
 * to the source code that should be inlined when a SAM module imports them.
 * The browser path resolves these via `samBrowserLoader.rewriteJsImports`
 * → `new URL(spec, import.meta.url).href`; the Node path can't fetch inside
 * a temp dir without a real same-origin URL, so we inline instead.
 *
 * The source MAY be empty string to skip the rewrite (leave the import alone
 * and let the runtime fail to resolve — useful for negative test cases).
 */
export type AbsoluteImportMap = Record<string, string>;

const STATIC_ABSOLUTE_IMPORT_MAP: AbsoluteImportMap = {
  // Populated lazily so the loader stays cheap to import. We resolve the
  // helper source via fs at first use; the helper is a small static file.
  // See `getAbsoluteImportMap()` below.
};

/** Lazily load the helper source and seed the static map. */
function getAbsoluteImportMap(): AbsoluteImportMap {
  if (Object.keys(STATIC_ABSOLUTE_IMPORT_MAP).length > 0) {
    return STATIC_ABSOLUTE_IMPORT_MAP;
  }
  // Read the helper source directly from the public/playgrounds directory.
  // The Node loader inlines it so the SAM doesn't need a network round-trip
  // inside a temp dir.
  try {
    const helperUrl = new URL(
      "../../public/playgrounds/functions-runtime.js",
      import.meta.url,
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    STATIC_ABSOLUTE_IMPORT_MAP["/playgrounds/functions-runtime.js"] = fs.readFileSync(
      helperUrl,
      "utf8",
    );
  } catch {
    // No helper available; the loader will leave absolute imports alone.
  }
  return STATIC_ABSOLUTE_IMPORT_MAP;
}

/**
 * Replace ESM imports of absolute paths in the loader's static map with
 * top-level `const` declarations that destructure the helper's exports.
 * The helper source is wrapped in an IIFE so its top-level `function`
 * declarations don't leak into the module scope.
 *
 * Supports `import { X } from "spec"`, `import X from "spec"`, and
 * `import * as X from "spec"`. A side-effect `import "spec"` becomes
 * `void (function(){ /* helper source *\/ })();`.
 */
function inlineAbsoluteImports(
  content: string,
  map: AbsoluteImportMap,
): string {
  if (Object.keys(map).length === 0) return content;
  // Mask `import.meta` so the regex below doesn't accidentally swallow it
  // (it's not a top-level import statement). We restore the mask at the end.
  const META = "IMPORTMETA";
  const masked = content.replace(/\bimport\.meta\b/gu, META);
  const replaceOne = (
    full: string,
    kw: string,
    mid: string,
    quote: string,
    spec: string,
  ): string => {
    const source = map[spec];
    if (source === undefined) return full;
    const trimmed = mid.trim();
    // The helper source is a self-invoking IIFE that exposes its surface on
    // `globalThis.PlaygroundsFunctionsRuntime` (Node path) or
    // `root.PlaygroundsFunctionsRuntime` (browser path). We capture the
    // surface by reading the global after the helper runs.
    const iife = `(function(){ ${source}; return globalThis.PlaygroundsFunctionsRuntime; })()`;
    if (trimmed === "") {
      return `void ${iife};`;
    }
    const defaultMatch = /^([A-Za-z_$][\w$]*)\s*$/.exec(trimmed);
    if (defaultMatch && kw === "import") {
      const name = defaultMatch[1]!;
      return `const ${name} = ${iife};`;
    }
    const nsMatch = /^\*\s+as\s+([A-Za-z_$][\w$]*)\s*$/.exec(trimmed);
    if (nsMatch && kw === "import") {
      return `const ${nsMatch[1]!} = ${iife};`;
    }
    const namedMatch = /^\{([\s\S]*)\}\s*$/.exec(trimmed);
    if (namedMatch && kw === "import") {
      const bindings = namedMatch[1]!.trim();
      return `const { ${bindings} } = ${iife};`;
    }
    return full;
  };

  let out = masked.replace(
    /\b(import|export)\b(?=[\s(,;]|from\b)([\s\S]*?)\s+from\s+(["'])(\/playgrounds\/[^"']+)\3/gu,
    (full, kw: string, mid: string, quote: string, spec: string) =>
      replaceOne(full, kw, mid, quote, spec),
  );
  // Side-effect imports (no `from`).
  out = out.replace(
    /\bimport\s+(["'])(\/playgrounds\/[^"']+)\1\s*;?/gu,
    (full, _quote: string, spec: string) => {
      const source = map[spec];
      if (source === undefined) return full;
      return `void (function(){ ${source} })();`;
    },
  );
  return out.replace(new RegExp(META, "gu"), "import.meta");
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

  const absMap = getAbsoluteImportMap();
  const root = await mkdtemp(join(tmpdir(), "sam-runtime-"));
  try {
    for (const [rawPath, content] of Object.entries(files)) {
      const path = normalizePath(rawPath);
      if (!isJsPath(path) || typeof content !== "string") continue;
      const abs = join(root, ...path.split("/"));
      await mkdir(dirname(abs), { recursive: true });
    const rewritten = inlineAbsoluteImports(content, absMap);
    await writeFile(abs, rewritten, "utf8");
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
