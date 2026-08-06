/**
 * HOST Platform Invite proxy unit tests (DEC-047／DASH-SPEC §7).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HostBridgeError } from "../hostBridge";
import {
  initializeSecretStore,
  lockSecretStore,
  resetSecretStoreForTests,
  setSecret,
  unlockSecretStore,
} from "../secretStore";
import { PLAYGROUNDS_API_KEY_SECRET } from "./platformClient";
import {
  hostCreatePlatformInvite,
  hostRevokePlatformInvite,
} from "./platformHostProxy";

vi.mock("./platformClient", async importOriginal => {
  const actual = await importOriginal<typeof import("./platformClient")>();
  return {
    ...actual,
    createPlatformInvite: vi.fn(),
    revokePlatformInvite: vi.fn(),
  };
});

import {
  createPlatformInvite as createInviteHttp,
  revokePlatformInvite as revokeInviteHttp,
} from "./platformClient";

const createInviteMock = vi.mocked(createInviteHttp);
const revokeInviteMock = vi.mocked(revokeInviteHttp);

describe("platformHostProxy", () => {
  beforeEach(async () => {
    await resetSecretStoreForTests();
    createInviteMock.mockReset();
    revokeInviteMock.mockReset();
  });

  afterEach(async () => {
    await resetSecretStoreForTests();
  });

  it("rejects when SecretStore is absent", async () => {
    await expect(hostCreatePlatformInvite()).rejects.toMatchObject({
      code: "secret_absent",
    });
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("rejects when SecretStore is locked", async () => {
    await initializeSecretStore("pass-test-1");
    await setSecret(PLAYGROUNDS_API_KEY_SECRET, "pg_sk_test");
    lockSecretStore();
    await expect(hostCreatePlatformInvite()).rejects.toMatchObject({
      code: "secret_locked",
    });
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("rejects when PLAYGROUNDS_API_KEY is missing", async () => {
    await initializeSecretStore("pass-test-2");
    await expect(hostCreatePlatformInvite()).rejects.toMatchObject({
      code: "secret_not_found",
    });
    expect(createInviteMock).not.toHaveBeenCalled();
  });

  it("mints invite with SecretStore key and defaults targetField", async () => {
    await initializeSecretStore("pass-test-3");
    await setSecret(PLAYGROUNDS_API_KEY_SECRET, "pg_sk_live");

    createInviteMock.mockResolvedValue({
      invite_id: "inv_1",
      kind: "signal.handshake",
      expires_at: 1,
      short_url: "https://api.samkuo.me/i/abc",
      deep_link: "https://play.samkuo.me/#pg=sec",
      secret: "sec",
    });

    const result = await hostCreatePlatformInvite({
      kind: "signal.handshake",
      intent: { note: "hi" },
    });

    expect(result.short_url).toContain("api.samkuo.me");
    expect(createInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "pg_sk_live",
        kind: "signal.handshake",
        intent: { note: "hi" },
        targetField: expect.any(String),
      })
    );
    expect(JSON.stringify(result)).not.toContain("pg_sk_live");
  });

  it("maps Platform HTTP errors to HostBridgeError", async () => {
    await initializeSecretStore("pass-test-4");
    await setSecret(PLAYGROUNDS_API_KEY_SECRET, "pg_sk_live");

    createInviteMock.mockRejectedValue(
      Object.assign(new Error("unauthorized"), {
        status: 401,
        data: { error: "unauthorized" },
      })
    );

    await expect(hostCreatePlatformInvite()).rejects.toBeInstanceOf(
      HostBridgeError
    );
    await expect(hostCreatePlatformInvite()).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("revokes invite via shell proxy", async () => {
    await initializeSecretStore("pass-test-5");
    await setSecret(PLAYGROUNDS_API_KEY_SECRET, "pg_sk_live");
    revokeInviteMock.mockResolvedValue(undefined);

    await expect(
      hostRevokePlatformInvite({ inviteId: "inv_1" })
    ).resolves.toEqual({ ok: true });
    expect(revokeInviteMock).toHaveBeenCalledWith({
      inviteId: "inv_1",
      apiKey: "pg_sk_live",
    });
  });

  it("requires inviteId for revoke", async () => {
    await expect(
      hostRevokePlatformInvite({ inviteId: "  " })
    ).rejects.toMatchObject({ code: "bad_args" });
  });
});
