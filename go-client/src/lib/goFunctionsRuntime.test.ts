import path from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGoWebKv,
  goStorageKeyForCatalog,
  resetGoWebKvMemoryForTests,
} from "./goWebKv";

const here = path.dirname(fileURLToPath(import.meta.url));
const rubikFunctions = path.resolve(here, "../../../../pg-rubik/functions.js");

afterEach(() => {
  resetGoWebKvMemoryForTests();
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
