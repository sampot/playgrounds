import { describe, expect, it } from "vitest";
import { formatBoothDeviceLoginCommand } from "./boothDeviceCli.js";

describe("formatBoothDeviceLoginCommand", () => {
  it("substitutes token and owner into a paste-ready command", () => {
    expect(
      formatBoothDeviceLoginCommand({
        deviceToken: "pg_dt_abc123secret",
        ownerUserId: "user_Wuo_apHCU8bo",
      })
    ).toBe(
      "pg-boothd login --device-token pg_dt_abc123secret --owner user_Wuo_apHCU8bo"
    );
  });

  it("rejects empty token or owner", () => {
    expect(() =>
      formatBoothDeviceLoginCommand({
        deviceToken: "",
        ownerUserId: "user-1",
      })
    ).toThrow("device_token_required");
    expect(() =>
      formatBoothDeviceLoginCommand({
        deviceToken: "pg_dt_x",
        ownerUserId: "  ",
      })
    ).toThrow("owner_user_id_required");
  });
});
