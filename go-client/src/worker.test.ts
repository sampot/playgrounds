import { describe, expect, it, vi } from "vitest";
import worker from "./worker";

describe("go static asset router", () => {
  it("serves SvelteKit 200.html for dynamic invite routes", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });

    const response = await worker.fetch(
      new Request("https://go.samkuo.me/i/RudmMcZ-ip", {
        headers: { accept: "text/html" },
      }),
      { ASSETS: { fetch } }
    );

    expect(await response.text()).toBe("/200.html");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("passes non-invite requests to the original asset URL", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });

    const response = await worker.fetch(
      new Request("https://go.samkuo.me/s/pg-gomoku"),
      { ASSETS: { fetch } }
    );

    expect(await response.text()).toBe("/s/pg-gomoku");
  });
});
