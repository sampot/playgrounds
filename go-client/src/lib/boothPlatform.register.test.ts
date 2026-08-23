import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerBoothAnchor,
  registerBoothAnchorWithForceRetry,
} from "./boothPlatform";

describe("registerBoothAnchorWithForceRetry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries register with force after anchor_session_active", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "anchor_session_active" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          boothSessionId: "sess-b",
          anchorSecret: "pg_ba_secret",
          wsUrl: "https://api.test/v1/booth/ws?role=engine",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const out = await registerBoothAnchorWithForceRetry({
      apiKey: "pg_sk_test",
      boothSessionId: "sess-b",
    });

    expect(out.anchorSecret).toBe("pg_ba_secret");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      force: true,
    });
  });

  it("surfaces other register failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "anchor_register_500" }),
      })
    );

    await expect(
      registerBoothAnchor({
        apiKey: "pg_sk_test",
        boothSessionId: "sess-b",
      })
    ).rejects.toThrow("anchor_register_500");
  });
});
