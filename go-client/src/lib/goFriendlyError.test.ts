import { afterEach, describe, expect, it, vi } from "vitest";
import {
  friendlyInviteError,
  friendlySamDownloadError,
  friendlySoloLoadError,
  isLikelyNetworkFailure,
  isLikelyRateLimited,
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

  it("treats GitHub HTTP 403 as rate-limited, not raw status", () => {
    const err = new Error("無法讀取儲存庫（HTTP 403）");
    expect(isLikelyRateLimited(err)).toBe(true);
    const msg = friendlySoloLoadError(err, "魔術方塊");
    expect(msg).toContain("有點多");
    expect(msg).toContain("魔術方塊");
    expect(msg).not.toMatch(/HTTP|403|儲存庫|api/i);
  });

  it("solo tree list 403 has no status code", () => {
    const msg = friendlySoloLoadError(
      new Error("無法列出檔案樹（HTTP 403）"),
      "打磚塊"
    );
    expect(msg).not.toMatch(/HTTP|\d{3}/);
    expect(msg).toMatch(/打磚塊|稍後/);
  });

  it("sam download maps download failure without HTTP", () => {
    const msg = friendlySamDownloadError(
      new Error("下載失敗：index.html（HTTP 403）")
    );
    expect(msg).not.toMatch(/HTTP|403|index\.html/);
    expect(msg.length).toBeGreaterThan(4);
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

  it("invite keeps plain Chinese domain errors", () => {
    expect(friendlyInviteError(new Error("邀請已關閉或過期"))).toBe(
      "邀請已關閉或過期"
    );
  });

  it("missing index.html is softened", () => {
    const msg = friendlySoloLoadError(new Error("小品缺少 index.html"), "數獨");
    expect(msg).toContain("不完整");
    expect(msg).not.toMatch(/index\.html/i);
  });
});
