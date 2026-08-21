import { describe, expect, it } from "vitest";
import { SESSION_PLAY_TYPE } from "@pg/roster/rosterSessionPlay";
import {
  createRoomSessionPlay,
  roomGuestShellMessageFromSessionEvent,
} from "./goRoomSessionPlay";

describe("roomGuestShellMessageFromSessionEvent", () => {
  it("clears seat-wait copy once the match is live", () => {
    expect(
      roomGuestShellMessageFromSessionEvent({ type: "match.started" })
    ).toBe("");
    expect(
      roomGuestShellMessageFromSessionEvent({
        type: "match.placed",
        status: "active",
      })
    ).toBe("");
    expect(
      roomGuestShellMessageFromSessionEvent({
        type: "match.status",
        status: "active",
      })
    ).toBe("");
    expect(
      roomGuestShellMessageFromSessionEvent({
        type: "match.reset",
        status: "active",
      })
    ).toBe("");
  });

  it("leaves seating／unknown events alone", () => {
    expect(
      roomGuestShellMessageFromSessionEvent({
        type: "match.status",
        status: "ready",
      })
    ).toBeUndefined();
    expect(
      roomGuestShellMessageFromSessionEvent({ type: "seat.joined" })
    ).toBeUndefined();
    expect(roomGuestShellMessageFromSessionEvent(null)).toBeUndefined();
  });
});


describe("createRoomSessionPlay", () => {
  function hostCtl() {
    return createRoomSessionPlay({
      localPeerId: () => "host-1",
      hostPeerId: () => "host-1",
      isBoothHost: () => true,
    });
  }

  function guestCtl() {
    return createRoomSessionPlay({
      localPeerId: () => "g-a",
      hostPeerId: () => "host-1",
      isBoothHost: () => false,
    });
  }

  it("host offer → loading；guest apply；markActive → active；end → idle", () => {
    const host = hostCtl();
    const guest = guestCtl();
    const offered = host.hostOffer({
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-a" },
      ],
    });
    expect(offered.ok).toBe(true);
    if (!offered.ok) throw new Error("offer");
    expect(offered.state.phase).toBe("loading");
    expect(offered.message.type).toBe(SESSION_PLAY_TYPE);

    const applied = guest.applyRemote(offered.message);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error("apply");
    expect(applied.state.phase).toBe("loading");
    expect(guest.seatRoleFor("g-a")).toBe("player");
    expect(guest.isSpectator("g-b")).toBe(true);

    expect(guest.markActive().phase).toBe("active");

    const ended = host.hostEnd();
    expect(ended.ok).toBe(true);
    if (!ended.ok) throw new Error("end");
    expect(guest.applyRemote(ended.message)).toEqual({
      ok: true,
      state: expect.objectContaining({ phase: "idle" }),
    });
  });

  it("rejects guest hostOffer／hostEnd and non-host remote offer", () => {
    const guest = guestCtl();
    expect(
      guest.hostOffer({
        catalogId: "pg-gomoku",
        seats: [{ role: "host", peerId: "g-a" }],
      }).ok
    ).toBe(false);
    expect(guest.hostEnd().ok).toBe(false);
    expect(
      guest.applyRemote({
        type: SESSION_PLAY_TYPE,
        v: 1,
        op: "offer",
        from: "g-a",
        catalogId: "pg-gomoku",
        seats: [{ role: "player", peerId: "g-a" }],
      })
    ).toEqual({ ok: false, reason: "not_host" });
  });

  it("snapshotOffer for late join；null when idle", () => {
    const host = hostCtl();
    expect(host.snapshotOffer()).toBeNull();
    host.hostOffer({
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-a" },
      ],
    });
    const snap = host.snapshotOffer();
    expect(snap).toMatchObject({
      op: "offer",
      catalogId: "pg-gomoku",
      from: "host-1",
    });
  });

  it("does not mint compose — offer wire has no invite fields", () => {
    const host = hostCtl();
    const offered = host.hostOffer({
      catalogId: "pg-gomoku",
      seats: [
        { role: "host", peerId: "host-1" },
        { role: "player", peerId: "g-a" },
      ],
    });
    if (!offered.ok) throw new Error("offer");
    const wire = offered.message as Record<string, unknown>;
    expect(wire.kind).toBeUndefined();
    expect(wire.shortUrl).toBeUndefined();
    expect(wire.inviteId).toBeUndefined();
  });
});
