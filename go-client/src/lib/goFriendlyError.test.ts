import { afterEach, describe, expect, it, vi } from "vitest";
import {
  friendlyInviteError,
  friendlySoloLoadError,
  isLikelyNetworkFailure,
} from "./goFriendlyError";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("goFriendlyError", () => {
  it("detects Failed to fetch as network failure", () => {
    expect(isLikelyNetworkFailure(new TypeError("Failed to fetch"))).toBe(
      true
    );
  });

  it("solo offline uncached uses plain language", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const msg = friendlySoloLoadError(
      new TypeError("Failed to fetch"),
      "打磚塊"
    );
    expect(msg).toContain("沒有網路");
    expect(msg).toContain("打磚塊");
    expect(msg).not.toMatch(/Failed to fetch/i);
  });

  it("solo online fetch failure avoids English engine text", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const msg = friendlySoloLoadError(
      new TypeError("Failed to fetch"),
      "五子棋"
    );
    expect(msg).toContain("連不上");
    expect(msg).not.toMatch(/Failed to fetch/i);
  });

  it("invite offline is temporary-session copy", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const msg = friendlyInviteError(new TypeError("Failed to fetch"));
    expect(msg).toContain("沒有網路");
    expect(msg).toContain("邀請");
    expect(msg).not.toMatch(/Failed to fetch/i);
  });
});
