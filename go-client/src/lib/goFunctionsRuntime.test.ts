import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileMap } from "@pg/projectTypes";
import {
  handleGoFunctionsApi,
  resetGoFunctionsModulesForTests,
} from "./goFunctionsRuntime";
import type { HostRuntime } from "./hostRuntime";
import {
  createGoWebKv,
  goStorageKeyForCatalog,
  resetGoWebKvMemoryForTests,
} from "./goWebKv";

const here = path.dirname(fileURLToPath(import.meta.url));
const rubikFunctions = path.resolve(here, "../../../../pg-rubik/functions.js");

afterEach(() => {
  resetGoWebKvMemoryForTests();
  void resetGoFunctionsModulesForTests();
});

describe("pg-rubik functions.js + goWebKv", () => {
  it("scores round-trip through env.KV (same contract as go /api)", async () => {
    const mod = await import(pathToFileURL(rubikFunctions).href);
    const handler = mod.default as {
      fetch: (
        req: Request,
        env: { KV: ReturnType<typeof createGoWebKv> }
      ) => Promise<Response>;
    };
    const KV = createGoWebKv(goStorageKeyForCatalog("pg-rubik"), {
      durable: false,
    });
    const env = { KV };

    const put = await handler.fetch(
      new Request("https://go.local/api/scores", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeMs: 45000, moves: 80 }),
      }),
      env
    );
    expect(put.status).toBe(200);

    const get = await handler.fetch(
      new Request("https://go.local/api/scores"),
      env
    );
    const data = (await get.json()) as {
      scores: { bestTimeMs: number; bestMoves: number };
    };
    expect(data.scores.bestTimeMs).toBe(45000);
    expect(data.scores.bestMoves).toBe(80);
  });
});

/**
 * Synthetic hostable SAM module — bypasses `loadFunctionsModule` (which uses
 * blob: URLs and only runs in a browser realm). Captures the env the runtime
 * injects so we can assert the binding shape.
 */
type CapturedEnv = Record<string, unknown> | null;
let capturedEnv: CapturedEnv = null;
const hostSessionFetchMock = vi.fn(async () => ({ state: { turn: "host" } }));

const hostableSamModule = {
  fetch: async (request: Request, env: Record<string, unknown>) => {
    capturedEnv = env;
    const url = new URL(request.url);
    if (url.pathname === "/api/host/state" && env.HOST) {
      const out = await (
        env.HOST as { hostSessionFetch: typeof hostSessionFetchMock }
      ).hostSessionFetch("/api/session/state", { method: "GET" });
      return new Response(JSON.stringify(out), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        hasHost: Boolean(env && env.HOST),
        hostCapabilities:
          env && env.HOST
            ? await (env.HOST as { capabilities: () => Promise<string[]> }).capabilities()
            : null,
      }),
      { headers: { "content-type": "application/json" } }
    );
  },
  dispose: async () => {},
};

vi.mock("@pg/functionsRuntime", async importOriginal => {
  const actual =
    await importOriginal<typeof import("@pg/functionsRuntime")>();
  return {
    ...actual,
    loadFunctionsModule: vi.fn(async () => hostableSamModule),
  };
});

function hostableSamFiles(): FileMap {
  return { "functions.js": "// stub — replaced by mock module" };
}

function readJson(response: { body: ArrayBuffer | null }): unknown {
  const buf = response.body;
  if (!buf || !buf.byteLength) return null;
  const text = new TextDecoder().decode(buf);
  return text ? (JSON.parse(text) as unknown) : null;
}

describe("goFunctionsRuntime — env.HOST injection (DEC-053)", () => {
  it("does not inject env.HOST when no host runtime is provided", async () => {
    capturedEnv = null;
    const response = await handleGoFunctionsApi(
      {
        getFiles: () => hostableSamFiles(),
        getSandboxId: () => "go-host-stub-1",
      },
      {
        method: "GET",
        url: "https://go.local/api/host/echo",
        headers: [],
        body: null,
      }
    );
    const data = readJson(response) as { hasHost: boolean };
    expect(response.status).toBe(200);
    expect(data.hasHost).toBe(false);
    expect(capturedEnv && Boolean(capturedEnv.HOST)).toBe(false);
  });

  it("injects env.HOST and exposes canonical capabilities when host runtime is present", async () => {
    capturedEnv = null;
    const rt = {
      hostSessionFetch: hostSessionFetchMock,
    } as unknown as HostRuntime;
    const response = await handleGoFunctionsApi(
      {
        getFiles: () => hostableSamFiles(),
        getSandboxId: () => "go-host-stub-2",
        getHostRuntime: () => rt,
      },
      {
        method: "GET",
        url: "https://go.local/api/host/echo",
        headers: [],
        body: null,
      }
    );
    const data = readJson(response) as {
      hasHost: boolean;
      hostCapabilities: string[];
    };
    expect(response.status).toBe(200);
    expect(data.hasHost).toBe(true);
    expect(data.hostCapabilities).toContain("hostSessionFetch");
    expect(data.hostCapabilities).toContain("platformInviteMint");
  });

  it("routes /api/host/state through env.HOST.hostSessionFetch → runtime", async () => {
    capturedEnv = null;
    hostSessionFetchMock.mockClear();
    const rt = {
      hostSessionFetch: hostSessionFetchMock,
    } as unknown as HostRuntime;
    const response = await handleGoFunctionsApi(
      {
        getFiles: () => hostableSamFiles(),
        getSandboxId: () => "go-host-stub-3",
        getHostRuntime: () => rt,
      },
      {
        method: "GET",
        url: "https://go.local/api/host/state",
        headers: [],
        body: null,
      }
    );
    const data = readJson(response) as { state: { turn: string } };
    expect(response.status).toBe(200);
    expect(hostSessionFetchMock).toHaveBeenCalledTimes(1);
    expect(hostSessionFetchMock.mock.calls[0]?.[0]).toBe("/api/session/state");
    expect(data.state).toEqual({ turn: "host" });
  });
});
