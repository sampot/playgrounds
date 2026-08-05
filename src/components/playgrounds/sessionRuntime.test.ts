import { afterEach, describe, expect, it } from "vitest";
import {
  setBroadcastChannelFactory,
  sessionChannelName,
} from "./sessionBroadcast";
import { SessionBridgeError } from "./sessionBridge";
import { SessionRuntime } from "./sessionRuntime";

class MockChannel {
  readonly name: string;
  readonly posts: unknown[] = [];
  constructor(name: string) {
    this.name = name;
  }
  postMessage(data: unknown) {
    this.posts.push(data);
  }
  close() {}
}

describe("SessionRuntime", () => {
  const channels: MockChannel[] = [];

  afterEach(() => {
    setBroadcastChannelFactory(null);
    channels.length = 0;
  });

  function setup() {
    setBroadcastChannelFactory(name => {
      const ch = new MockChannel(name);
      channels.push(ch);
      return ch as unknown as BroadcastChannel;
    });
    return new SessionRuntime();
  }

  const protocol = {
    protocolId: "brainstorm.v1",
    apiVersion: "1",
    roles: ["human", "participant"],
    roleLimits: { participant: 2 },
  };

  it("opens session and creates BroadcastChannel name", () => {
    const rt = setup();
    const s = rt.open("host-1", protocol);
    expect(s.hostSandboxId).toBe("host-1");
    expect(s.status).toBe("open");
    expect(s.channelName).toBe(sessionChannelName(s.sessionId));
    expect(channels[0]?.name).toBe(s.channelName);
  });

  it("rejects protocol mismatch on joinAgent", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    expect(() =>
      rt.joinAgent({
        sandboxId: "p1",
        role: "participant",
        protocolId: "other.v1",
        apiVersion: "1",
      })
    ).toThrow(SessionBridgeError);
    try {
      rt.joinAgent({
        sandboxId: "p1",
        role: "participant",
        protocolId: "other.v1",
        apiVersion: "1",
      });
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("protocol_mismatch");
    }
  });

  it("allows different project ids with matching protocol", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const a = rt.joinAgent({
      sandboxId: "agent-x",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
    });
    const b = rt.joinAgent({
      sandboxId: "agent-y",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
    });
    expect(a.sandboxId).toBe("agent-x");
    expect(b.sandboxId).toBe("agent-y");
  });

  it("enforces role seat_full", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    rt.joinAgent({
      sandboxId: "a1",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
    });
    rt.joinAgent({
      sandboxId: "a2",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
    });
    try {
      rt.joinAgent({
        sandboxId: "a3",
        role: "participant",
        protocolId: "brainstorm.v1",
        apiVersion: "1",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("seat_full");
    }
  });

  it("publishes events with monotonic seq", () => {
    const rt = setup();
    const s = rt.open("host-1", protocol);
    const seq = rt.publishEvents([{ type: "hi" }, { type: "there" }]);
    expect(seq).toBe(2);
    expect(channels[0]?.posts).toHaveLength(2);
    expect(channels[0]?.posts[0]).toMatchObject({
      type: "session-event",
      sessionId: s.sessionId,
      seq: 1,
    });
    expect(channels[0]?.posts[1]).toMatchObject({ seq: 2 });
  });

  it("pause blocks act", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const seat = rt.joinHuman("human");
    rt.pause();
    expect(() => rt.assertCanAct(seat.seatId)).toThrow(/暫停/);
  });

  it("resume restores act after pause", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const seat = rt.joinHuman("human");
    rt.pause();
    rt.resume();
    expect(rt.assertCanAct(seat.seatId).seatId).toBe(seat.seatId);
  });

  it("rejects unknown roles", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    try {
      rt.joinAgent({
        sandboxId: "p1",
        role: "moderator",
        protocolId: "brainstorm.v1",
        apiVersion: "1",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("role_forbidden");
    }
  });

  it("enforces SESSION_MAX_AGENT_SEATS", () => {
    const rt = setup();
    const wide = {
      protocolId: "wide.v1",
      apiVersion: "1",
      roles: ["a", "b", "c", "d", "e"],
      roleLimits: undefined as Record<string, number> | undefined,
    };
    rt.open("host-1", wide);
    for (let i = 0; i < 4; i++) {
      rt.joinAgent({
        sandboxId: `p${i}`,
        role: wide.roles[i]!,
        protocolId: "wide.v1",
        apiVersion: "1",
      });
    }
    try {
      rt.joinAgent({
        sandboxId: "p4",
        role: "e",
        protocolId: "wide.v1",
        apiVersion: "1",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("capacity_exceeded");
    }
  });

  it("leaveSeat removes seat; close clears session", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const seat = rt.joinAgent({
      sandboxId: "a1",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
    });
    rt.leaveSeat(seat.seatId);
    expect(rt.listSeats()).toHaveLength(0);
    rt.close();
    expect(rt.getSession()).toBeNull();
  });

  it("blocks act when seat is paused", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const seat = rt.joinHuman("human");
    rt.setSeatPaused(seat.seatId, true);
    try {
      rt.assertCanAct(seat.seatId);
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("session_paused");
    }
  });

  it("defaults joinPolicy to invite_or_apply when omitted", () => {
    const rt = setup();
    const s = rt.open("host-1", protocol);
    expect(s.protocol.joinPolicy).toBe("invite_or_apply");
    rt.joinAgent({
      sandboxId: "apply-1",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
      via: "apply",
    });
    rt.joinAgent({
      sandboxId: "invite-1",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
      via: "invite",
    });
    expect(rt.listSeats().filter(x => x.kind === "agent")).toHaveLength(2);
  });

  it("invite_only rejects apply and allows invite", () => {
    const rt = setup();
    rt.open("host-1", {
      ...protocol,
      joinPolicy: "invite_only",
    });
    try {
      rt.joinAgent({
        sandboxId: "p1",
        role: "participant",
        protocolId: "brainstorm.v1",
        apiVersion: "1",
        via: "apply",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("join_forbidden");
    }
    const seat = rt.joinAgent({
      sandboxId: "p1",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
      via: "invite",
    });
    expect(seat.sandboxId).toBe("p1");
  });

  it("stores remote roster proxy metadata on joinAgent", () => {
    const rt = setup();
    rt.open("host-1", protocol);
    const seat = rt.joinAgent({
      sandboxId: "avatar-proj",
      role: "participant",
      protocolId: "brainstorm.v1",
      apiVersion: "1",
      via: "invite",
      remote: { peerAgentId: "peer-a", inviteId: "inv-9" },
    });
    expect(seat.remote).toEqual({
      peerAgentId: "peer-a",
      inviteId: "inv-9",
    });
  });

  it("defaults via to apply when omitted", () => {
    const rt = setup();
    rt.open("host-1", { ...protocol, joinPolicy: "invite_only" });
    try {
      rt.joinAgent({
        sandboxId: "p1",
        role: "participant",
        protocolId: "brainstorm.v1",
        apiVersion: "1",
      });
      expect.unreachable();
    } catch (e) {
      expect((e as SessionBridgeError).code).toBe("join_forbidden");
    }
  });
});
