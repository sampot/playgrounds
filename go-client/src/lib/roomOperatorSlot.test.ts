import { describe, expect, it } from "vitest";
import {
  operatorDisplayNameForShell,
  operatorPeerIdForShell,
} from "./roomOperatorSlot";

describe("roomOperatorSlot", () => {
  it("derives stable operator peer id from shell id", () => {
    expect(operatorPeerIdForShell("op-abc123")).toBe("op-op-abc123");
  });

  it("labels operator display name with shell suffix", () => {
    expect(operatorDisplayNameForShell("op-abc123")).toBe("遠端 (c123)");
  });
});
