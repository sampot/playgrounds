import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applySnapshotToRoomFields,
  createRemoteBoothHubEngine,
} from "./boothRemoteHubEngine";
import type { BoothControlChannel } from "./boothControlChannel";

function mockChannel(): BoothControlChannel {
  let open = false;
  const listeners = new Set<(msg: import("./boothHubEngine").BoothEngineEvent) => void>();
  return {
    async connect() {
      open = true;
      const snapshot = {
        sessionId: "sess-remote",
        ownerUserId: "user-1",
        engineMode: "daemon" as const,
        members: [
          {
            peerId: "host-1",
            displayName: "主持",
            kind: "host" as const,
            isHost: true,
          },
          {
            peerId: "guest-1",
            displayName: "訪客",
            kind: "guest" as const,
            isHost: false,
          },
        ],
        inviteGate: "live" as const,
        shareFileCount: 0,
        guestCount: 1,
        anchor: "online" as const,
      };
      for (const listener of listeners) {
        listener({ type: "booth.state.snapshot", snapshot });
      }
      return { sessionId: snapshot.sessionId, snapshot };
    },
    close() {
      open = false;
    },
    isOpen: () => open,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispatch(intent) {
      if (intent.type === "end") return { ok: true };
      if (intent.type === "cast.offer") return { ok: false, error: "not_director" };
      return { ok: true };
    },
  };
}

describe("createRemoteBoothHubEngine", () => {
  it("connectChannel exposes daemon session id", async () => {
    const engine = createRemoteBoothHubEngine({
      shellId: "browser-shell",
      connect: async () => mockChannel(),
    });
    const snapshot = await engine.connectChannel();
    expect(engine.sessionId).toBe("sess-remote");
    expect(snapshot.guestCount).toBe(1);
  });

  it("forwards dispatch to control channel", async () => {
    const dispatch = vi.fn(async () => ({ ok: true }));
    const engine = createRemoteBoothHubEngine({
      shellId: "browser-shell",
      connect: async () => ({
        ...mockChannel(),
        dispatch,
      }),
    });
    await engine.connectChannel();
    const ack = await engine.dispatch(
      { type: "invite.mint" },
      { shellId: "browser-shell", role: "host" }
    );
    expect(ack.ok).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({ type: "invite.mint" });
  });
});

describe("applySnapshotToRoomFields", () => {
  it("maps members to occupant peers", () => {
    const out = applySnapshotToRoomFields({
      sessionId: "s",
      ownerUserId: "u",
      engineMode: "daemon",
      members: [
        {
          peerId: "host",
          displayName: "H",
          kind: "host",
          isHost: true,
        },
        {
          peerId: "g1",
          displayName: "G",
          kind: "guest",
          isHost: false,
        },
      ],
      inviteGate: "live",
      shareFileCount: 0,
      guestCount: 1,
      anchor: "online",
      inviteShortUrl: "https://go.test/i/x",
    });
    expect(out.occupantPeers).toEqual([
      { peerId: "g1", name: "G", kind: "guest" },
    ]);
    expect(out.inviteGate).toBe("live");
  });
});
