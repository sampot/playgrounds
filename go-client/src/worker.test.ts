import { describe, expect, it, vi } from "vitest";
import worker from "./worker";

describe("go static asset router", () => {
  it("serves SvelteKit 200.html for operator remote shell", async () => {
    const fetch = vi.fn(async (request: Request) => {
      return new Response(new URL(request.url).pathname);
    });

    const response = await worker.fetch(
      new Request("https://go.samkuo.me/room/remote?cap=pg_op_test", {
        headers: { accept: "text/html" },
      }),
      { ASSETS: { fetch } }
    );

    expect(await response.text()).toBe("/200");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

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

    expect(await response.text()).toBe("/200");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("redirects legacy /chat to /room", async () => {
    const fetch = vi.fn();
    const response = await worker.fetch(
      new Request("https://go.samkuo.me/chat"),
      { ASSETS: { fetch } }
    );
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://go.samkuo.me/room");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not SPA-fallback /room-file so a missed SW cannot feed HTML to media", async () => {
    const fetch = vi.fn();
    for (const path of ["/room-file/tr-1", "/room-play/tr-1"]) {
      const response = await worker.fetch(
        new Request(`https://go.samkuo.me${path}`),
        { ASSETS: { fetch } }
      );
      expect(response.status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
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
