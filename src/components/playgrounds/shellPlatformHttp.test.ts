import { describe, expect, it, vi } from "vitest";
import {
  handleShellPlatformHttp,
  isShellPlatformApiPath,
} from "./shellPlatformHttp";

describe("shellPlatformHttp", () => {
  it("detects platform API paths", () => {
    expect(isShellPlatformApiPath("/api/shell/platform/invite")).toBe(true);
    expect(
      isShellPlatformApiPath(
        "/playgrounds/canvas/abc/api/shell/platform/invite"
      )
    ).toBe(true);
    expect(isShellPlatformApiPath("/api/shell/session/open")).toBe(false);
  });

  it("mints invite via handlers", async () => {
    const createInvite = vi.fn().mockResolvedValue({
      invite_id: "inv_1",
      kind: "invite.compose",
      expires_at: Date.parse("2026-08-07T00:00:00.000Z"),
      short_url: "https://api.samkuo.me/i/x",
      deep_link: "https://play.samkuo.me/#pg=secret",
      secret: "secret",
    });
    const res = await handleShellPlatformHttp(
      new Request("https://h.local/api/shell/platform/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "invite.compose",
          intent: { version: 1 },
        }),
      }),
      { createInvite }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.short_url).toContain("/i/");
    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "invite.compose" })
    );
  });
});
