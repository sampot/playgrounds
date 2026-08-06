import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseWebShare,
  isShareAbort,
  shareOrCopy,
} from "./shareOrCopy";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isShareAbort", () => {
  it("detects AbortError DOMException", () => {
    expect(isShareAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isShareAbort(new DOMException("x", "NotAllowedError"))).toBe(false);
    expect(isShareAbort(new Error("AbortError"))).toBe(false);
  });
});

describe("canUseWebShare", () => {
  it("is false without navigator.share", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    expect(canUseWebShare()).toBe(false);
  });

  it("is true when share exists", () => {
    vi.stubGlobal("navigator", {
      share: vi.fn(),
      clipboard: { writeText: vi.fn() },
    });
    expect(canUseWebShare()).toBe(true);
  });
});

describe("shareOrCopy", () => {
  it("uses Web Share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: () => true,
      clipboard: { writeText: vi.fn() },
    });
    await expect(
      shareOrCopy({
        title: "Demo",
        text: "hi",
        url: "https://play.samkuo.me/?open=acme%2Fdemo",
      })
    ).resolves.toBe("shared");
    // text must not be passed — UAs often append it after url and break deep links.
    expect(share).toHaveBeenCalledWith({
      title: "Demo",
      url: "https://play.samkuo.me/?open=acme%2Fdemo",
    });
  });

  it("rethrows AbortError without clipboard fallback", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new DOMException("cancel", "AbortError")),
      canShare: () => true,
      clipboard: { writeText },
    });
    await expect(
      shareOrCopy({ title: "Demo", url: "https://play.samkuo.me/" })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("falls back to clipboard when share fails", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share: vi.fn().mockRejectedValue(new Error("nope")),
      canShare: () => true,
      clipboard: { writeText },
    });
    await expect(
      shareOrCopy({ title: "Demo", url: "https://play.samkuo.me/sam/" })
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://play.samkuo.me/sam/");
  });

  it("copies when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(
      shareOrCopy({ title: "Demo", url: "https://play.samkuo.me/sam/?q=a" })
    ).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(
      "https://play.samkuo.me/sam/?q=a"
    );
  });

  it("rejects empty url", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn() },
    });
    await expect(shareOrCopy({ title: "x", url: "  " })).rejects.toThrow(
      /網址為空/
    );
  });
});
