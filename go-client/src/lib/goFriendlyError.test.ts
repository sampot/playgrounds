import { afterEach, describe, expect, it, vi } from "vitest";
import {
  friendlyInviteError,
  friendlyOperatorAckError,
  friendlyOperatorError,
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

  it("invite maps anchor_offline for room guests", () => {
    const msg = friendlyInviteError(new Error("anchor_offline"), "連線失敗");
    expect(msg).toContain("主持");
    expect(msg).not.toMatch(/anchor_offline/i);
  });

  it("invite maps booth join timeout", () => {
    const msg = friendlyInviteError(new Error("timeout"));
    expect(msg).toContain("逾時");
    expect(msg).not.toMatch(/timeout/i);
  });

  it("missing index.html is softened", () => {
    const msg = friendlySoloLoadError(new Error("小品缺少 index.html"), "數獨");
    expect(msg).toContain("不完整");
    expect(msg).not.toMatch(/index\.html/i);
  });

  it("operator ws_failed is plain Chinese", () => {
    const msg = friendlyOperatorError(new Error("ws_failed"));
    expect(msg).toContain("連不上包廂");
    expect(msg).not.toMatch(/ws_failed/i);
  });

  it("operator offline copy", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const msg = friendlyOperatorError(new Error("ws_failed"));
    expect(msg).toContain("沒有網路");
    expect(msg).not.toMatch(/ws_failed/i);
  });

  it("operator cap unauthorized is softened", () => {
    const msg = friendlyOperatorError(new Error("operator_cap_401"));
    expect(msg).toContain("過期");
    expect(msg).not.toMatch(/401|operator_cap/i);
  });

  it("operator remote_disabled is plain Chinese", () => {
    const msg = friendlyOperatorError(new Error("remote_disabled"));
    expect(msg).toContain("遠端連回");
    expect(msg).not.toMatch(/remote_disabled/i);
  });

  it("operator engine_offline is plain Chinese", () => {
    const msg = friendlyOperatorError(new Error("engine_offline"));
    expect(msg).toContain("包廂");
    expect(msg).not.toMatch(/engine_offline/i);
  });

  it("operator ack maps not_director", () => {
    expect(friendlyOperatorAckError("not_director")).toContain("檢視");
    expect(friendlyOperatorAckError("not_director")).not.toMatch(/not_director/i);
  });
});
