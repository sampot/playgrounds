import { describe, expect, it } from "vitest";
import {
  composeWantsRelay,
  stampComposeRelayPrefer,
} from "./platformCompose";

describe("composeWantsRelay", () => {
  it("defaults to direct connectivity when relay was not selected", () => {
    expect(
      composeWantsRelay({
        version: 1,
        transport: { roster: { signal: true } },
      })
    ).toBe(false);
  });

  it("enables TURN only for an explicit relay opt-in", () => {
    expect(
      composeWantsRelay({
        version: 1,
        transport: { roster: { signal: true, relay: true } },
      })
    ).toBe(true);
  });
});

describe("stampComposeRelayPrefer", () => {
  it("leaves intent unchanged when Host did not prefer relay", () => {
    const intent = {
      version: 1 as const,
      transport: { roster: { signal: true } },
    };
    expect(stampComposeRelayPrefer(intent, false)).toEqual(intent);
  });

  it("stamps transport.roster.relay when Host prefers official TURN", () => {
    expect(
      stampComposeRelayPrefer(
        {
          version: 1,
          sam: { source: "pg-gomoku" },
          transport: { roster: { signal: true } },
        },
        true
      )
    ).toEqual({
      version: 1,
      sam: { source: "pg-gomoku" },
      transport: { roster: { signal: true, relay: true } },
    });
  });

  it("creates a minimal compose intent when prefer is on and intent missing", () => {
    expect(stampComposeRelayPrefer(undefined, true)).toEqual({
      version: 1,
      transport: { roster: { signal: true, relay: true } },
    });
  });
});
