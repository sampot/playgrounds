/**
 * go canvas `/api` → functions.js with env.KV／env.DB (IndexedDB／localStorage).
 *
 * Optional env.HOST injection (DEC-053): when the SAM is hostable (the page
 * has bound a `HostRuntime` for it), we also inject `env.HOST` (same shape
 * as the field `HostBridge`) so functions.js can route `/api/host/*` to the
 * go-local `createGoHostBinding` factory. The factory in turn wraps the
 * shared `HostRuntime` (env.KV authority) + `goAuth` (Platform invite mint).
 * UI must not call `/api/host/*` directly — only functions.js does.
 */

import {
  deserializeRequest,
  functionsUnavailableBody,
  serializeResponse,
  type SerializedRequest,
  type SerializedResponse,
} from "@pg/canvasSwProtocol";
import {
  functionsSourceFingerprint,
  invokeFunctionsFetch,
  loadFunctionsModule,
  type LoadedFunctionsModule,
} from "@pg/functionsRuntime";
import type { FileMap } from "@pg/projectTypes";
import { createDefaultFunctionsHandler } from "../../../src/sam-runtime/defaultFunctionsHandler.ts";
import { createGoWebDb } from "./goWebDb";
import {
  createGoWebKv,
  goStorageKeyEphemeral,
  goStorageKeyForCatalog,
} from "./goWebKv";
import { createGoHostBinding } from "./goHostBinding";
import type { HostRuntime } from "./hostRuntime";
import {
  createSessionBinding,
  getSessionSeatIdForProject,
} from "@pg/sessionBridge";

export type GoFunctionsApiContext = {
  getFiles: () => FileMap | null;
  /** Durable catalog id for `/s/`; null → ephemeral memory bindings. */
  getCatalogId?: () => string | null;
  getSandboxId: () => string | null;
  /**
   * Optional: parsed `.env` Record<string,string>. Wired in `mountGoCanvas`
   * when the SAM ships a `.env`. The default handler reads env.vars via
   * this getter so the host can surface DEC-035 secrets-less vars
   * without holding a module-scope reference.
   */
  getEnvVars?: () => Readonly<Record<string, string>>;
  /**
   * Resolve the active `HostRuntime` for this sandbox (DEC-053 env.HOST).
   * When non-null, `env.HOST` is injected into functions.js so its
   * `/api/host/*` routes have a backing implementation. When null (single-
   * player SAMs, guest seats, or pre-bind), `env.HOST` is omitted so
   * functions.js that try to use it get a clear `not_implemented` error
   * instead of seeing a half-wired binding.
   */
  getHostRuntime?: () => HostRuntime | null;
};

type CacheEntry = {
  fingerprint: string;
  mod: LoadedFunctionsModule;
  isDefault: boolean;
};

const moduleCache = new Map<string, CacheEntry>();

/**
 * Build a LoadedFunctionsModule that wraps `createDefaultFunctionsHandler`
 * with the SAM's intrinsic env (KV/DB/vars/SESSION/HOST). The env is
 * computed at request time so the latest state is always reflected
 * (matters for SESSION/HOST which can attach later).
 */
async function wrapDefaultHandler(
  _files: FileMap,
  ctx: GoFunctionsApiContext,
): Promise<LoadedFunctionsModule | null> {
  const buildHandler = () => {
    const sandboxId = ctx.getSandboxId() || "go";
    const { key, durable } = storageFor(ctx);
    const hostRuntime = ctx.getHostRuntime?.() ?? null;
    const env: Record<string, unknown> = {
      KV: createGoWebKv(key, { durable }),
      DB: createGoWebDb(key, { durable }),
      // env.vars — parsed by the host from SAM's .env at request time.
      // We read it lazily from the WebKV-free slot: env.vars is exposed
      // as a Record via the runtime; for go we accept the surface from
      // ctx.getEnvVars?.() (optional) or fall back to an empty object.
      ...(typeof ctx.getEnvVars === "function" ? { vars: ctx.getEnvVars() } : {}),
      ...(getSessionSeatIdForProject(sandboxId)
        ? { SESSION: createSessionBinding(sandboxId) }
        : {}),
      ...(hostRuntime
        ? {
            HOST: createGoHostBinding({
              getHostRuntime: () => hostRuntime,
            }),
          }
        : {}),
    };
    return createDefaultFunctionsHandler(() => env);
  };
  // We build a fresh handler per call because env references mutable state
  // and the SAM may receive different bindings across requests. The
  // cached module shape wraps a function that re-evaluates env on each
  // fetch.
  return {
    // LoadedFunctionsModule's signature is 2-arg (request, env); the
    // default handler ignores the ctx slot and resolves on the env it
    // builds per request. We discard the ctx param to satisfy the
    // LoadedFunctionsModule shape.
    fetch: async (request, _env) =>
      buildHandler().fetch(
        request,
        _env,
        createNoopSamExecutionContext(),
      ),
    dispose: () => {},
  };
}

function createNoopSamExecutionContext(): import("../../../src/sam-runtime/types.ts").SamExecutionContext {
  return {
    waitUntil: () => {},
    schedule: () => ({ cancel: () => {} }),
  };
}

function jsonBytesResponse(body: string, status: number): SerializedResponse {
  const bytes = new TextEncoder().encode(body);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    status,
    statusText: "",
    headers: [["Content-Type", "application/json; charset=utf-8"]],
    body: copy.buffer,
  };
}

function storageFor(ctx: GoFunctionsApiContext): {
  key: string;
  durable: boolean;
} {
  const catalogId = ctx.getCatalogId?.()?.trim() || null;
  if (catalogId) {
    return { key: goStorageKeyForCatalog(catalogId), durable: true };
  }
  const sandboxId = ctx.getSandboxId()?.trim() || "anonymous";
  return { key: goStorageKeyEphemeral(sandboxId), durable: false };
}

async function getModule(
  cacheKey: string,
  files: FileMap
): Promise<LoadedFunctionsModule | null> {
  const fp = functionsSourceFingerprint(files);
  const hit = moduleCache.get(cacheKey);
  if (hit && hit.fingerprint === fp) return hit.mod;
  if (hit) {
    try {
      await hit.mod.dispose();
    } catch {
      /* ignore */
    }
    moduleCache.delete(cacheKey);
  }
  const mod = await loadFunctionsModule(files);
  if (!mod) return null;
  moduleCache.set(cacheKey, { fingerprint: fp, mod, isDefault: false });
  return mod;
}

export async function handleGoFunctionsApi(
  ctx: GoFunctionsApiContext,
  request: SerializedRequest
): Promise<SerializedResponse> {
  const files = ctx.getFiles();
  if (!files) {
    return jsonBytesResponse(functionsUnavailableBody(), 503);
  }
  const sandboxId = ctx.getSandboxId() || "go";
  let mod = await getModule(sandboxId, files);
  let isDefaultHandler = false;
  if (!mod) {
    // Phase 6 (2): mirror the field shell — when the SAM has no
    // functions.js, host-install the default handler so /api/kv/...,
    // /api/db/..., /api/vars, /api/capabilities all work without SAM
    // plumbing. SAM-supplied functions.js always wins (PG-UI-SDK-SPEC §4).
    isDefaultHandler = true;
    mod = await wrapDefaultHandler(files, ctx);
  }
  if (!mod) {
    return jsonBytesResponse(functionsUnavailableBody(), 503);
  }
  const { key, durable } = storageFor(ctx);
  const hostRuntime = ctx.getHostRuntime?.() ?? null;
  const env: Record<string, unknown> = {
    KV: createGoWebKv(key, { durable }),
    DB: createGoWebDb(key, { durable }),
    // Seated guest: inject env.SESSION (DEC-023) so the SAM's own functions.js
    // tunnel branch handles `/api/session/*` instead of the go shell re-
    // implementing the routes. Mirrors the field shell's createFunctionsEnv.
    ...(getSessionSeatIdForProject(sandboxId)
      ? { SESSION: createSessionBinding(sandboxId) }
      : {}),
    // Hostable sandbox: inject env.HOST (DEC-053). Same shape as the field
    // HostBridge so functions.js is portable across play.samkuo.me and go.
    // factory is lazy so it picks up the shared HostRuntime singleton.
    ...(hostRuntime
      ? {
          HOST: createGoHostBinding({
            getHostRuntime: () => hostRuntime,
          }),
        }
      : {}),
  };
  try {
    const req = deserializeRequest(request);
    const response = await invokeFunctionsFetch(mod, req, env);
    return await serializeResponse(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonBytesResponse(
      JSON.stringify({
        error: "playgrounds_functions_error",
        message,
      }),
      500
    );
  }
}

/** Drop cached modules (tests／hot reload). */
export async function resetGoFunctionsModulesForTests(): Promise<void> {
  for (const entry of moduleCache.values()) {
    try {
      await entry.mod.dispose();
    } catch {
      /* ignore */
    }
  }
  moduleCache.clear();
}
