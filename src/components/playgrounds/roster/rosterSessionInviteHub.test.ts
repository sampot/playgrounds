import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  inviteRosterAvatarToSession,
  registerRosterInviteAcceptedHandler,
  registerRosterRelayTransport,
  resetRosterSessionHubForTests,
  setRosterOpenSession,
  notifyRosterInviteAccepted,
  rosterCanInviteToSession,
} from "./rosterSessionInviteHub";

describe("rosterSessionInviteHub", () => {
  beforeEach(() => {
    resetRosterSessionHubForTests();
  });

  it("inviteRosterAvatarToSession sends full protocol payload", () => {
    const send = vi.fn();
    registerRosterRelayTransport({
      send,
      getPeerAgentId: () => "peer-1",
      getProjectionSandboxId: () => "proj-1",
    });
    setRosterOpenSession({
      sessionId: "sess-9",
      status: "open",
      protocol: {
        protocolId: "brainstorm.v1",
        apiVersion: "1",
        roles: ["human", "participant"],
        joinPolicy: "invite_or_apply",
      },
    });
    expect(rosterCanInviteToSession()).toBe(true);
    const invite = inviteRosterAvatarToSession({ role: "participant" });
    expect(invite.sessionId).toBe("sess-9");
    expect(invite.protocol.protocolId).toBe("brainstorm.v1");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "session_invite",
        sessionId: "sess-9",
        role: "participant",
      }),
      "peer-1"
    );
  });

  it("notifyRosterInviteAccepted calls registered handler", async () => {
    const handler = vi.fn();
    registerRosterInviteAcceptedHandler(handler);
    notifyRosterInviteAccepted({
      peerAgentId: "p",
      inviteId: "i",
      sessionId: "s",
      role: "participant",
    });
    expect(handler).toHaveBeenCalledOnce();
  });
});
