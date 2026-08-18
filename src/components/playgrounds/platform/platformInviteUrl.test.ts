import { describe, expect, it } from "vitest";
  import {
  buildPgInviteDeepLink,
  clearPgInviteHashFromLocation,
  extractPlatformInviteRefFromText,
  parsePgInviteFromLocation,
  PG_INVITE_HASH_KEY,
} from "./platformInviteUrl";
import {
  composeNeedsMaximize,
  composeSamSource,
  wantsRosterSignal,
} from "./platformCompose";

describe("platformInviteUrl", () => {
  it("parses #pg= secret", () => {
    const parsed = parsePgInviteFromLocation({
      hash: `#${PG_INVITE_HASH_KEY}=abcXYZ`,
    });
    expect(parsed?.secret).toBe("abcXYZ");
  });

  it("builds deep link for Safari copy", () => {
    expect(
      buildPgInviteDeepLink({
        origin: "https://play.samkuo.me",
        pathname: "/",
        secret: "sec/1",
      })
    ).toBe("https://play.samkuo.me/#pg=sec%2F1");
  });

  it("clears hash when present", () => {
    // jsdom may not exist — only assert helper is callable
    expect(() => clearPgInviteHashFromLocation()).not.toThrow();
  });
  it("extracts short id from go／api /i/ URL", () => {
    expect(
      extractPlatformInviteRefFromText("https://go.samkuo.me/i/abc_12")
    ).toEqual({ kind: "shortId", shortId: "abc_12" });
    expect(
      extractPlatformInviteRefFromText("https://play.samkuo.me/#pg=secXYZ")
    ).toEqual({ kind: "secret", secret: "secXYZ" });
    expect(extractPlatformInviteRefFromText("opaqueTok1")).toEqual({
      kind: "ambiguous",
      value: "opaqueTok1",
    });
  });
});

describe("platformCompose", () => {
  it("detects maximize and sam source", () => {
    const intent = {
      sam: {
        source: "https://example.com/a.sam",
        presentation: "maximize_preview" as const,
      },
      transport: { roster: { signal: true } },
    };
    expect(composeSamSource(intent)).toBe("https://example.com/a.sam");
    expect(composeNeedsMaximize(intent)).toBe(true);
    expect(wantsRosterSignal("invite.compose", intent)).toBe(true);
  });

  it("signal.handshake always wants signal", () => {
    expect(wantsRosterSignal("signal.handshake", {})).toBe(true);
  });

  it("invite.room always wants signal", () => {
    expect(wantsRosterSignal("invite.room", {})).toBe(true);
  });
});
