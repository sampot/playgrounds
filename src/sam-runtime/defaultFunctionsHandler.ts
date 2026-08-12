/**
 * Host-installed default `functions.js` handler (PG-UI-SDK-SPEC §4).
 *
 * When a SAM provides no `functions.js`, the Backend Runtime mounts this handler
 * so the canvas `/api/...` surface can speak to the sandbox's intrinsic
 * bindings (`env.KV` / `env.DB` / `env.vars` / `env.secrets.*`) without the SAM
 * author writing CRUD plumbing.
 *
 * The routing is delegated to `functionsRouting.ts` so the SAM-side helper
 * (`public/playgrounds/functions-runtime.js`) can share the same logic shape.
 * See `tests/functionsRuntime.test.ts` for the parity fixture.
 *
 * SECRETS: per DEC-029/035, the default handler NEVER returns secret values —
 * only the names listed on `env.secrets.*`. Values must be read inside a SAM's
 * own `functions.js` via `env.secrets.<NAME>.get()` (the binding lives behind
 * a master key only the backend can hold).
 */

import type {
  FunctionsHandler,
  SamEnv,
  SamExecutionContext,
} from "./types.ts";
import {
  route as routeRequest,
  RoutingError,
} from "./functionsRouting.ts";

export type {
  KvBinding,
  DbBinding,
  VarsBinding,
  SecretsNamespace,
  SecretBindingEntry,
} from "./functionsRouting.ts";

export type DefaultHandlerErrorCode =
  | "not_found"
  | "kv_key_too_large"
  | "db_sql_error"
  | "secrets_locked"
  | "internal_error";

/** Build a default functions.js-style `fetch` handler bound to the given env. */
export function createDefaultFunctionsHandler(
  envOrGetter: SamEnv | (() => SamEnv),
): FunctionsHandler {
  const getEnv = typeof envOrGetter === "function" ? envOrGetter : () => envOrGetter;
  return {
    async fetch(
      request: Request,
      _e: SamEnv,
      _ctx: SamExecutionContext,
    ): Promise<Response> {
      try {
        return await routeRequest(request, getEnv());
      } catch (e) {
        return errorResponse(e);
      }
    },
  };
}

function errorResponse(e: unknown): Response {
  if (e instanceof RoutingError) {
    return new Response(
      JSON.stringify({ code: e.code, message: e.message }),
      {
        status: e.status(),
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
  return new Response(
    JSON.stringify({
      code: "internal_error",
      message: e instanceof Error ? e.message : String(e),
    }),
    {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}
