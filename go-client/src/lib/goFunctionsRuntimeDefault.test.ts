import { afterEach, describe, expect, it } from "vitest";
import {
  handleGoFunctionsApi,
  resetGoFunctionsModulesForTests,
} from "./goFunctionsRuntime";
import { resetGoWebKvMemoryForTests } from "./goWebKv";

afterEach(() => {
  resetGoWebKvMemoryForTests();
  void resetGoFunctionsModulesForTests();
});

// Phase 6 (2): parity with the field shell — when the SAM has no
// functions.js, the go shell installs the host's defaultFunctionsHandler
// so /api/kv/... /api/db/... /api/vars /api/capabilities all work
// transparently (PG-UI-SDK-SPEC G4 + §4).
// SAM-supplied functions.js precedence is covered by
// goFunctionsRuntime.test.ts (DEC-053 env.HOST tests). This file
// focuses on the new default-handler fallback path.
// SAM-supplied functions.js precedence is covered by
// goFunctionsRuntime.test.ts (DEC-053 env.HOST tests). This file
// focuses on the new default-handler fallback path.
describe("goFunctionsRuntime — host default handler fallback (Phase 6)", () => {
  function filesWithoutFunctionsJs(): Record<string, string> {
    return {
      "index.html": "<!doctype html><html><body>hi</body></html>",
      // No functions.js — host should fall back to the default handler.
    };
  }

  function ctx(
    extra: Record<string, unknown> = {},
    files: Record<string, string> = filesWithoutFunctionsJs(),
  ) {
    return {
      getFiles: () => files,
      getCatalogId: () => "pg-hello-sdk",
      getSandboxId: () => "hello-sdk",
      ...extra,
    };
  }

  function serializeRequest(req: {
    method: string;
    url: string;
    body?: string | null;
  }): {
    method: string;
    url: string;
    headers: Array<[string, string]>;
    body: ArrayBuffer | null;
  } {
    const headers: Array<[string, string]> = [];
    if (req.body) headers.push(["content-type", "text/plain"]);
    const encoder = new TextEncoder();
    return {
      method: req.method,
      url: req.url,
      headers,
      body: req.body ? encoder.encode(req.body).buffer : null,
    };
  }

  it("serves /api/kv/<key> from env.KV when the SAM has no functions.js", async () => {
    // Pre-seed KV so the read returns our value. Note: every request
    // constructs a fresh KV via createGoWebKv; we need to seed through
    // the same code path. We do it by issuing a /api/kv/hits PUT first.
    const put = await handleGoFunctionsApi(
      ctx(),
      serializeRequest({
        method: "PUT",
        url: "https://go.local/api/kv/hits",
        body: "42",
      }),
    );
    expect(put.status).toBe(204); // KV put is 204 No Content (parity with field shell)

    const response = await handleGoFunctionsApi(
      ctx(),
      serializeRequest({
        method: "GET",
        url: "https://go.local/api/kv/hits",
      }),
    );
    expect(response.status).toBe(200);
    const text = new TextDecoder().decode(response.body ?? new ArrayBuffer(0));
    expect(text).toBe("42");
  });

  it("serves /api/vars from env.vars (parsed .env) when the host supplies it", async () => {
    const response = await handleGoFunctionsApi(
      ctx({ getEnvVars: () => ({ GREETING: "hi", MODE: "dev" }) }),
      serializeRequest({
        method: "GET",
        url: "https://go.local/api/vars",
      }),
    );
    expect(response.status).toBe(200);
    const data = JSON.parse(
      new TextDecoder().decode(response.body ?? new ArrayBuffer(0)),
    ) as Record<string, string>;
    expect(data).toEqual({ GREETING: "hi", MODE: "dev" });
  });

  it("returns /api/capabilities reflecting env intrinsics + bindings", async () => {
    const response = await handleGoFunctionsApi(
      ctx(),
      serializeRequest({
        method: "GET",
        url: "https://go.local/api/capabilities",
      }),
    );
    expect(response.status).toBe(200);
    const data = JSON.parse(
      new TextDecoder().decode(response.body ?? new ArrayBuffer(0)),
    ) as { intrinsics: string[]; bindings: string[] };
    // env.KV/env.DB are always wired; env.vars only appears when the
    // host supplies a parsed .env via getEnvVars.
    expect(data.intrinsics).toEqual(expect.arrayContaining(["kv", "db"]));
  });

  it("treats a legacy empty functions.js stub as no custom handler", async () => {
    const response = await handleGoFunctionsApi(
      ctx(
        {},
        {
          "index.html": "<!doctype html><html><body>hi</body></html>",
          "functions.js": `
            /* Legacy game template: storage was called directly from the UI. */
            export default {};
          `,
        },
      ),
      serializeRequest({
        method: "GET",
        url: "https://go.local/api/capabilities",
      }),
    );

    expect(response.status).toBe(200);
    const data = JSON.parse(
      new TextDecoder().decode(response.body ?? new ArrayBuffer(0)),
    ) as { intrinsics: string[] };
    expect(data.intrinsics).toEqual(expect.arrayContaining(["kv", "db"]));
  });

  it("returns 404 not_found (not 503) for unknown /api paths when no functions.js", async () => {
    // Regression: the host-installed default handler returns a proper
    // not_found from the routing logic — NOT a 503 "functions
    // unavailable". The 503 path should only fire when the SAM files
    // aren't loaded at all (e.g., pre-snapshot).
    const response = await handleGoFunctionsApi(
      ctx(),
      serializeRequest({
        method: "GET",
        url: "https://go.local/api/custom/not-on-default",
      }),
    );
    expect(response.status).toBe(404);
  });
});