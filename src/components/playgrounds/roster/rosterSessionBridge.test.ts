import { describe, expect, it } from "vitest";
import {
  SESSION_INVITE_KIND,
  buildSessionInvitePayload,
  isSessionInviteAcceptPayload,
  isSessionInviteCancelPayload,
  isSessionInviteKindPayload,
  isSessionInvitePayload,
  isSessionInviteRejectPayload,
  sessionInviteToCatalogSpec,
} from "./rosterSessionBridge";

const protocol = {
  protocolId: "brainstorm.v1",
  apiVersion: "1",
  roles: ["human", "participant", "scribe"],
  joinPolicy: "invite_or_apply" as const,
};

describe("rosterSessionBridge", () => {
  it("buildSessionInvitePayload includes full protocol", () => {
    const invite = buildSessionInvitePayload({
      sessionId: "sess-1",
      protocol,
      role: "participant",
      inviteId: "inv-1",
    });
    expect(invite).toMatchObject({
      kind: SESSION_INVITE_KIND,
      inviteId: "inv-1",
      sessionId: "sess-1",
      role: "participant",
      protocol: {
        protocolId: "brainstorm.v1",
        apiVersion: "1",
        roles: ["human", "participant", "scribe"],
        joinPolicy: "invite_or_apply",
      },
    });
    expect(isSessionInvitePayload(invite)).toBe(true);
    expect(sessionInviteToCatalogSpec(invite).role).toBe("participant");
  });

  it("guards accept／reject／cancel", () => {
    expect(
      isSessionInviteAcceptPayload({
        kind: "session_invite_accept",
        inviteId: "i",
        sessionId: "s",
        role: "participant",
        homeSandboxId: "sbx",
      })
    ).toBe(true);
    expect(
      isSessionInviteRejectPayload({
        kind: "session_invite_reject",
        inviteId: "i",
        sessionId: "s",
        reason: "nope",
      })
    ).toBe(true);
    expect(
      isSessionInviteCancelPayload({
        kind: "session_invite_cancel",
        inviteId: "i",
        sessionId: "s",
      })
    ).toBe(true);
    expect(isSessionInviteKindPayload({ kind: "ping" })).toBe(false);
    expect(
      isSessionInvitePayload({
        kind: SESSION_INVITE_KIND,
        inviteId: "i",
        sessionId: "s",
        role: "participant",
        protocol: { protocolId: "x", apiVersion: "" },
      })
    ).toBe(false);
  });
});
