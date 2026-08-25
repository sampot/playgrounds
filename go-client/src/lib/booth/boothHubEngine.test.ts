import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmbeddedBoothHubEngine,
  intentRequiresDirector,
  type BoothHubEngineHandlers,
} from "./boothHubEngine";

function emptyHandlers(
  overrides: Partial<BoothHubEngineHandlers> = {}
): BoothHubEngineHandlers {
  return {
    inviteMint: vi.fn().mockResolvedValue(undefined),
    inviteRevoke: vi.fn().mockResolvedValue(undefined),
    castOffer: vi.fn().mockResolvedValue(undefined),
    castUnoffer: vi.fn().mockResolvedValue(undefined),
    castState: vi.fn().mockResolvedValue(undefined),
    ejectPeer: vi.fn().mockResolvedValue(undefined),
    end: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createEmbeddedBoothHubEngine", () => {
  let handlers: BoothHubEngineHandlers;

  beforeEach(() => {
    handlers = emptyHandlers();
  });

  it("host shell holds director by default", () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => true,
    });

    engine.registerShell({ shellId: "host-local", role: "host" });
    expect(engine.getDirector()).toEqual({
      shellId: "host-local",
      role: "host",
    });
  });

  it("rejects director-gated cast when viewer shell dispatches", async () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => false,
    });

    engine.registerShell({ shellId: "host-local", role: "host" });
    engine.registerShell({ shellId: "op-remote", role: "operator" });
    engine.claimOperatorDirector("op-remote");

    const ack = await engine.dispatch(
      { type: "cast.offer", payload: { kind: "live", peerId: "p1" } },
      { shellId: "host-local", role: "host" }
    );

    expect(ack).toEqual({ ok: false, error: "not_director" });
    expect(handlers.castOffer).not.toHaveBeenCalled();
  });

  it("acknowledges cast offer for director shell", async () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => true,
    });

    engine.registerShell({ shellId: "host-local", role: "host" });

    const ack = await engine.dispatch(
      { type: "cast.offer", payload: { kind: "live", peerId: "p1" } },
      { shellId: "host-local", role: "host" }
    );

    expect(ack).toEqual({ ok: true });
    expect(handlers.castOffer).toHaveBeenCalledWith({
      kind: "live",
      peerId: "p1",
    });
  });

  it("mints peerCap for director and rejects duplicate mint without revoke", async () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => true,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });

    const first = await engine.dispatch(
      { type: "peer.mint", label: "cam-a", ttlSec: 3600 },
      { shellId: "host-local", role: "host" }
    );
    expect(first.ok).toBe(true);
    expect(first.payload?.peerCap).toMatch(/^pg_peer_/);
    expect(first.payload?.peerCapId).toBeTruthy();
    expect(first.payload?.joinUrl).toMatch(/peerCap=|cap=/);

    const second = await engine.dispatch(
      { type: "peer.mint", label: "cam-b" },
      { shellId: "host-local", role: "host" }
    );
    expect(second).toEqual({ ok: false, error: "engine_busy" });
  });

  it("revokes peerCap then allows a new mint", async () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => true,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });

    const minted = await engine.dispatch(
      { type: "peer.mint", label: "cam-a" },
      { shellId: "host-local", role: "host" }
    );
    const peerCapId = String(minted.payload?.peerCapId);

    const revoked = await engine.dispatch(
      { type: "peer.revoke", peerCapId },
      { shellId: "host-local", role: "host" }
    );
    expect(revoked).toEqual({ ok: true });

    const again = await engine.dispatch(
      { type: "peer.mint", label: "cam-b" },
      { shellId: "host-local", role: "host" }
    );
    expect(again.ok).toBe(true);
    expect(again.payload?.peerCapId).not.toBe(peerCapId);
  });

  it("validatePeerCap and acceptPeerOffer delegate to handler", async () => {
    const acceptPeerOffer = vi.fn(async () => ({
      answerWire: "answer-wire",
      peerId: "peer-1",
    }));
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "owner",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "owner",
        engineMode: "embedded",
        hostPeerId: "host",
        hostDisplayName: "Host",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        privateFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      acceptPeerOffer,
      localHostClaimsDirector: () => true,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });

    const minted = await engine.dispatch(
      { type: "peer.mint", label: "cam" },
      { shellId: "host-local", role: "host" }
    );
    const cap = String(minted.payload?.peerCap);
    expect(engine.validatePeerCap(cap)).toBe(true);
    expect(engine.validatePeerCap("bad")).toBe(false);

    const accepted = await engine.acceptPeerOffer("offer", "cam");
    expect(accepted).toEqual({ answerWire: "answer-wire", peerId: "peer-1" });
    expect(acceptPeerOffer).toHaveBeenCalledWith("offer", "cam");
  });

  it("shutdown ends session and rejects further intents", async () => {
    const onEnded = vi.fn();
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers: { ...handlers, end: onEnded },
      localHostClaimsDirector: () => true,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });

    await engine.shutdown("user");
    expect(onEnded).toHaveBeenCalledTimes(1);

    const ack = await engine.dispatch(
      { type: "invite.mint" },
      { shellId: "host-local", role: "host" }
    );
    expect(ack).toEqual({ ok: false, error: "session_ended" });
  });

  it("operator claims director while host tab would have focus", () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => true,
    });

    engine.registerShell({ shellId: "host-local", role: "host" });
    expect(engine.getDirector()?.shellId).toBe("host-local");

    const grant = engine.claimOperatorDirector("op-remote");
    expect(grant.role).toBe("operator");
    expect(engine.getDirector()).toEqual({
      shellId: "op-remote",
      role: "operator",
    });
  });

  it("host can explicitly reclaim director from operator", () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
      localHostClaimsDirector: () => false,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });
    engine.claimOperatorDirector("op-remote");
    expect(engine.getDirector()?.shellId).toBe("op-remote");

    engine.reclaimDirectorForHostShell();
    expect(engine.getDirector()).toEqual({
      shellId: "host-local",
      role: "host",
    });
  });

  it("releases director back to host when operator disconnects", () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });
    engine.claimOperatorDirector("op-remote");
    engine.releaseOperatorDirector("op-remote");
    expect(engine.getDirector()).toEqual({
      shellId: "host-local",
      role: "host",
    });
  });

  it("replaces an existing operator director with a newer operator", () => {
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });
    engine.claimOperatorDirector("op-a");
    engine.claimOperatorDirector("op-b");
    expect(engine.getDirector()).toEqual({
      shellId: "op-b",
      role: "operator",
    });
  });

  it("private.remove and share.rescan do not require director", async () => {
    const privateRemove = vi.fn().mockResolvedValue(undefined);
    const shareRescan = vi.fn().mockResolvedValue(undefined);
    const engine = createEmbeddedBoothHubEngine({
      ownerUserId: () => "user-1",
      buildSnapshot: () => ({
        sessionId: engine.sessionId,
        ownerUserId: "user-1",
        engineMode: "embedded",
        members: [],
        inviteGate: "none",
        shareFileCount: 0,
        guestCount: 0,
        anchor: "offline",
      }),
      handlers: {
        ...handlers,
        privateRemove,
        shareRescan,
      },
      localHostClaimsDirector: () => false,
    });
    engine.registerShell({ shellId: "host-local", role: "host" });
    engine.registerShell({ shellId: "op-remote", role: "operator" });
    engine.claimOperatorDirector("op-remote");

    const removeAck = await engine.dispatch(
      { type: "private.remove", id: "pvt_abc" },
      { shellId: "op-remote", role: "operator" }
    );
    expect(removeAck).toEqual({ ok: true });
    expect(privateRemove).toHaveBeenCalledWith("pvt_abc");

    const rescanAck = await engine.dispatch(
      { type: "share.rescan" },
      { shellId: "host-local", role: "host" }
    );
    expect(rescanAck).toEqual({ ok: true });
    expect(shareRescan).toHaveBeenCalledTimes(1);
  });
});

describe("intentRequiresDirector", () => {
  it("marks cast and peer intents as director-gated", () => {
    expect(intentRequiresDirector({ type: "cast.offer", payload: {} })).toBe(
      true
    );
    expect(intentRequiresDirector({ type: "peer.mint" })).toBe(true);
    expect(intentRequiresDirector({ type: "private.fetch", id: "x" })).toBe(
      false
    );
    expect(intentRequiresDirector({ type: "share.rescan" })).toBe(false);
  });
});
