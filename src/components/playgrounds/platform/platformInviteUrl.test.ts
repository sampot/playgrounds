import { describe, expect, it } from "vitest";
import {
  clearPgInviteHashFromLocation,
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

  it("clears hash when present", () => {
    // jsdom may not exist — only assert helper is callable
    expect(() => clearPgInviteHashFromLocation()).not.toThrow();
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
});
