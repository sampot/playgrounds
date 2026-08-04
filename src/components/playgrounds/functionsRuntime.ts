/**
 * Workers-shaped functions runtime for Playgrounds (DEC-016／DEC-038).
 * Loads `functions.js` via blob URL + dynamic `import()` — **no** host iframe.
 */

import { FUNCTIONS_ENTRY } from "./canvasSwProtocol";
import { normalizeProjectPath } from "./pathUtils";
import { isTextContent, type FileMap } from "./projectTypes";
import { loadBrowserEsmDefault } from "./samBrowserLoader";

export interface FunctionsExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export type FunctionsEnv = Record<string, unknown>;

export interface FunctionsHandler {
  fetch(
    request: Request,
    env: FunctionsEnv,
    ctx: FunctionsExecutionContext
  ): Response | Promise<Response>;
}

export interface LoadedFunctionsModule {
  fetch: FunctionsHandler["fetch"];
  /** Revoke blob URLs. */
  dispose(): void | Promise<void>;
}

function isJsPath(path: string): boolean {
  return /\.(?:m?js|cjs)$/iu.test(path);
}

export function createFunctionsExecutionContext(): FunctionsExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      void Promise.resolve(promise).catch(() => {
        /* fire-and-forget */
      });
    },
    passThroughOnException() {
      /* no-op in sandbox */
    },
  };
}

/**
 * Fingerprint project JS sources so the shell can reuse a loaded module.
 */
export function functionsSourceFingerprint(files: FileMap): string {
  const parts: string[] = [];
  for (const path of Object.keys(files).sort()) {
    if (!isJsPath(path)) continue;
    const content = files[path];
    if (!isTextContent(content)) continue;
    parts.push(
      `${normalizeProjectPath(path)}:${content.length}:${content.slice(0, 64)}`
    );
  }
  return parts.join("|");
}

/**
 * Load `functions.js` (+ relative ESM deps) from the project FileMap.
 * Returns null when the entry file is missing.
 */
export async function loadFunctionsModule(
  files: FileMap
): Promise<LoadedFunctionsModule | null> {
  const loaded = await loadBrowserEsmDefault<{
    default?: FunctionsHandler;
  }>(files, FUNCTIONS_ENTRY);
  if (!loaded) return null;

  const handler = loaded.exports.default;
  if (!handler || typeof handler.fetch !== "function") {
    await loaded.dispose();
    throw new Error("functions.js 須 export default { fetch }");
  }

  return {
    fetch: (request, env, ctx) => handler.fetch(request, env, ctx),
    dispose() {
      return loaded.dispose();
    },
  };
}

export async function invokeFunctionsFetch(
  mod: LoadedFunctionsModule,
  request: Request,
  env: FunctionsEnv = {}
): Promise<Response> {
  const ctx = createFunctionsExecutionContext();
  const result = await mod.fetch(request, env, ctx);
  if (!isResponseLike(result)) {
    throw new Error("functions.js fetch 必須回傳 Response");
  }
  // Normalize in case the module realm differs (historical iframe; still safe).
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers: result.headers,
  });
}

function isResponseLike(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Response).status === "number" &&
    typeof (value as Response).arrayBuffer === "function" &&
    typeof (value as Response).headers === "object"
  );
}
