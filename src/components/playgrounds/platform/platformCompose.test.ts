import { describe, expect, it } from "vitest";
import {
  INVITE_ROOM_KIND,
  buildInviteRoomIntent,
  composeSamSource,
  composeWantsRelay,
  isInviteComposeIntent,
  isInviteRoomKind,
  isRoomInvite,
  stampComposeRelayPrefer,
  wantsRosterSignal,
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

describe("invite.room", () => {
  it("recognizes the room kind and always wants Roster signal", () => {
    expect(isInviteRoomKind(INVITE_ROOM_KIND)).toBe(true);
    expect(isInviteRoomKind("invite.compose")).toBe(false);
    expect(wantsRosterSignal(INVITE_ROOM_KIND, {})).toBe(true);
    expect(wantsRosterSignal(INVITE_ROOM_KIND, buildInviteRoomIntent())).toBe(
      true
    );
  });

  it("builds a SAM-less room intent with signaling on and relay off", () => {
    const intent = buildInviteRoomIntent();
    expect(intent).toEqual({
      version: 1,
      surface: "room",
      consent: "always_ask",
      transport: { roster: { signal: true } },
    });
    expect(composeWantsRelay(intent)).toBe(false);
  });

  it("never treats a room surface as compose TURN relay", () => {
    expect(
      composeWantsRelay({
        version: 1,
        surface: "room",
        transport: { roster: { signal: true, relay: true } },
      })
    ).toBe(false);
  });

  it("treats intent.surface=room as a 包廂 invite when kind is not invite.room", () => {
    const intent = buildInviteRoomIntent();
    expect(isRoomInvite("signal.handshake", intent)).toBe(true);
    expect(isRoomInvite(undefined, intent)).toBe(true);
    expect(isRoomInvite("invite.compose", intent)).toBe(true);
    expect(isInviteComposeIntent(intent)).toBe(false);
    expect(composeSamSource(intent)).toBeNull();
    expect(wantsRosterSignal("signal.handshake", intent)).toBe(true);
  });

  it("does not steal a game compose invite that has a SAM source", () => {
    const intent = {
      version: 1 as const,
      sam: { source: "pg-gomoku" },
      transport: { roster: { signal: true } },
    };
    expect(isRoomInvite("invite.compose", intent)).toBe(false);
    expect(isInviteComposeIntent(intent)).toBe(true);
    expect(composeSamSource(intent)).toBe("pg-gomoku");
  });
});
