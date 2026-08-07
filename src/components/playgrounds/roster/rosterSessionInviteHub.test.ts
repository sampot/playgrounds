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
    expect(invite.catalogId).toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "session_invite",
        sessionId: "sess-9",
        role: "participant",
      }),
      "peer-1"
    );
  });

  it("gomoku invite prefills catalogId／source／player role", () => {
    const send = vi.fn();
    registerRosterRelayTransport({
      send,
      getPeerAgentId: () => "peer-1",
      getProjectionSandboxId: () => "proj-1",
    });
    setRosterOpenSession({
      sessionId: "sess-g",
      status: "open",
      protocol: {
        protocolId: "gomoku.v1",
        apiVersion: "1",
        roles: ["host", "player"],
      },
    });
    const invite = inviteRosterAvatarToSession();
    expect(invite.role).toBe("player");
    expect(invite.catalogId).toBe("pg-gomoku");
    expect(invite.source).toBe("sampot/pg-gomoku");
  });

  it("coding-orch invite prefills catalogId／source／worker role", () => {
    const send = vi.fn();
    registerRosterRelayTransport({
      send,
      getPeerAgentId: () => "peer-1",
      getProjectionSandboxId: () => "proj-1",
    });
    setRosterOpenSession({
      sessionId: "sess-c",
      status: "open",
      protocol: {
        protocolId: "coding-orchestration.v1",
        apiVersion: "1",
        roles: ["host", "worker"],
      },
    });
    const invite = inviteRosterAvatarToSession();
    expect(invite.role).toBe("worker");
    expect(invite.catalogId).toBe("pg-llm-agent");
    expect(invite.source).toBe("sampot/pg-llm-agent");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogId: "pg-llm-agent",
        source: "sampot/pg-llm-agent",
        role: "worker",
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
