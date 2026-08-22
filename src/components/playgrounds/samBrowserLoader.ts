/**
 * Browser ESM loader for SamInstance (DEC-024 / DEC-031).
 * Blob URL + dynamic `import()` in the shell realm — no hidden iframe
 * (Agent Controllers must run without DOM／iframe mount).
 */

import { rewriteJsImports } from "./composePreview";
import { normalizeProjectPath } from "./pathUtils";
import { isTextContent, type FileMap } from "./projectTypes";
import type {
  LoadedEsmModule,
  SamEsmLoader,
  SamFileMap,
} from "../../sam-runtime/types.ts";

function isJsPath(path: string): boolean {
  return /\.(?:m?js|cjs)$/iu.test(path);
}

function requireText(path: string, files: FileMap): string {
  const content = files[path];
  if (content === undefined || !isTextContent(content)) {
    throw new Error(`預期文字 JS：${path}`);
  }
  return content;
}

/** Convert Playgrounds FileMap to SamFileMap (text only). */
export function fileMapToSamFiles(files: FileMap): SamFileMap {
  const out: SamFileMap = {};
  for (const [path, content] of Object.entries(files)) {
    if (isTextContent(content)) out[normalizeProjectPath(path)] = content;
  }
  return out;
}

/** Static `import` / `export … from` only — not runtime `import()`. */
const STATIC_RELATIVE_IMPORT_RE =
  /\b(?:import|export)\s*[\s\S]*?\s+from\s+["'](\.[^"']+)["']/gu;

/** Drop comments so JSDoc `import('./x.js')` type refs are not dependency edges. */
function stripJsComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

function relativeImportSpecs(code: string): string[] {
  const specs: string[] = [];
  const stripped = stripJsComments(code);
  for (const m of stripped.matchAll(STATIC_RELATIVE_IMPORT_RE)) {
    const spec = m[1];
    if (spec) specs.push(spec);
  }
  return specs;
}

/** @internal Vitest — static relative import specs after comment strip. */
export function listStaticRelativeImportsForTest(code: string): string[] {
  return relativeImportSpecs(code);
}

function resolveRelative(fromFile: string, href: string): string | null {
  const raw = href.trim();
  if (
    !raw ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("//")
  ) {
    return null;
  }
  try {
    const base = fromFile.includes("/")
      ? fromFile.slice(0, fromFile.lastIndexOf("/"))
      : "";
    const joined = base ? `${base}/${raw}` : raw;
    return normalizeProjectPath(joined);
  } catch {
    return null;
  }
}

/**
 * Build a blob-URL module graph (DAG) and dynamic-import `entryPath`.
 * No iframe / import map — Controllers stay alive after load with zero module iframes.
 */
export async function loadBrowserEsmDefault<T = unknown>(
  files: SamFileMap | FileMap,
  entryPath: string
): Promise<LoadedEsmModule<T> | null> {
  const entry = normalizeProjectPath(entryPath);
  const asFileMap: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    asFileMap[normalizeProjectPath(path)] = content;
  }
  if (!(entry in asFileMap) || !isTextContent(asFileMap[entry]!)) {
    return null;
  }

  const pathToUrl = new Map<string, string>();
  const blobUrls: string[] = [];
  const ensuring = new Set<string>();

  const ensureBlobUrl = (path: string): string => {
    const existing = pathToUrl.get(path);
    if (existing) return existing;
    if (ensuring.has(path)) {
      throw new Error(
        `循環 ESM 依賴尚不支援（無 iframe）：${path}（入口 ${entry}）`
      );
    }
    if (!(path in asFileMap) || !isTextContent(asFileMap[path]!)) {
      throw new Error(`找不到模組：${path}`);
    }
    ensuring.add(path);
    const raw = requireText(path, asFileMap);
    for (const spec of relativeImportSpecs(raw)) {
      const dep = resolveRelative(path, spec);
      if (dep && isJsPath(dep)) ensureBlobUrl(dep);
    }
    const rewritten = rewriteJsImports(raw, path, pathToUrl);
    const url = URL.createObjectURL(
      new Blob([rewritten], { type: "text/javascript" })
    );
    blobUrls.push(url);
    pathToUrl.set(path, url);
    ensuring.delete(path);
    return url;
  };

  let entryUrl: string;
  try {
    entryUrl = ensureBlobUrl(entry);
  } catch (e) {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    throw e;
  }

  try {
    const mod = (await import(/* @vite-ignore */ entryUrl)) as T & {
      default?: unknown;
    };
    if (!mod || (mod as { default?: unknown }).default === undefined) {
      throw new Error(`${entry} 須 export default`);
    }
    return {
      exports: mod,
      async dispose() {
        for (const url of blobUrls) URL.revokeObjectURL(url);
      },
    };
  } catch (e) {
    for (const url of blobUrls) URL.revokeObjectURL(url);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export const browserSamEsmLoader: SamEsmLoader = loadBrowserEsmDefault;
