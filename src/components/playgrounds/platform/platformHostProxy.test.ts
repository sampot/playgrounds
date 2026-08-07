import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  hostCreatePlatformInvite,
  hostRevokePlatformInvite,
} from "./platformHostProxy";
import {
  resetPlatformFieldCredentialForTests,
  setPlatformFieldApiKey,
} from "./platformFieldCredential";
import * as client from "./platformClient";

vi.mock("./platformClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./platformClient")>();
  return {
    ...actual,
    createPlatformInvite: vi.fn(),
    revokePlatformInvite: vi.fn(),
  };
});

describe("platformHostProxy (memory key)", () => {
  beforeEach(() => {
    resetPlatformFieldCredentialForTests();
    vi.mocked(client.createPlatformInvite).mockReset();
    vi.mocked(client.revokePlatformInvite).mockReset();
  });

  it("rejects when not provisioned", async () => {
    await expect(hostCreatePlatformInvite()).rejects.toMatchObject({
      code: "not_provisioned",
    });
  });

  it("mints invite with memory key", async () => {
    setPlatformFieldApiKey("pg_sk_live");
    vi.mocked(client.createPlatformInvite).mockResolvedValue({
      invite_id: "inv1",
      kind: "signal.handshake",
      expires_at: Date.now() + 60_000,
      short_url: "https://api.samkuo.me/i/abc",
      deep_link: "https://play.samkuo.me/#pg=sec",
      secret: "sec",
    });
    const created = await hostCreatePlatformInvite({ kind: "signal.handshake" });
    expect(created.invite_id).toBe("inv1");
    expect(client.createPlatformInvite).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "pg_sk_live" })
    );
  });

  it("revokes with memory key", async () => {
    setPlatformFieldApiKey("pg_sk_live");
    vi.mocked(client.revokePlatformInvite).mockResolvedValue(undefined as never);
    await hostRevokePlatformInvite({ inviteId: "inv1" });
    expect(client.revokePlatformInvite).toHaveBeenCalledWith({
      inviteId: "inv1",
      apiKey: "pg_sk_live",
    });
  });
});
