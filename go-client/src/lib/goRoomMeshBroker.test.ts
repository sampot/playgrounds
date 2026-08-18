import { describe, expect, it } from "vitest";
import { SESSION_MESH_TYPE } from "@pg/roster/rosterSessionMesh";
import { createRoomMeshBroker } from "./goRoomMeshBroker";

describe("createRoomMeshBroker", () => {
  it("introduces existing guests to a newcomer and does not mesh the Host", () => {
    const sent: { to: string; msg: unknown }[] = [];
    const broker = createRoomMeshBroker({
      sendTo: (to, msg) => sent.push({ to, msg }),
    });
    broker.addPeer("g-a");
    broker.introduce("g-a");
    expect(sent).toHaveLength(0);

    broker.addPeer("g-b");
    broker.introduce("g-b");
    expect(sent).toEqual([
      {
        to: "g-b",
        msg: { type: SESSION_MESH_TYPE, v: 1, op: "hello", peerId: "g-a" },
      },
      {
        to: "g-a",
        msg: { type: SESSION_MESH_TYPE, v: 1, op: "hello", peerId: "g-b" },
      },
    ]);
  });

  it("forwards offer／answer／fail to the named peer and stamps from", () => {
    const sent: { to: string; msg: unknown }[] = [];
    const broker = createRoomMeshBroker({
      sendTo: (to, msg) => sent.push({ to, msg }),
    });
    broker.addPeer("g-a");
    broker.addPeer("g-b");
    broker.forward("g-a", {
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "offer",
      from: "spoof",
      to: "g-b",
      sdp: "wire",
    });
    expect(sent).toEqual([
      {
        to: "g-b",
        msg: {
          type: SESSION_MESH_TYPE,
          v: 1,
          op: "offer",
          from: "g-a",
          to: "g-b",
          sdp: "wire",
        },
      },
    ]);
  });

  it("does not forward to an unknown peer or back to the sender", () => {
    const sent: { to: string; msg: unknown }[] = [];
    const broker = createRoomMeshBroker({
      sendTo: (to, msg) => sent.push({ to, msg }),
    });
    broker.addPeer("g-a");
    broker.forward("g-a", {
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "fail",
      from: "g-a",
      to: "g-missing",
    });
    broker.forward("g-a", {
      type: SESSION_MESH_TYPE,
      v: 1,
      op: "fail",
      from: "g-a",
      to: "g-a",
    });
    expect(sent).toHaveLength(0);
  });

  it("tells remaining guests when a peer leaves", () => {
    const sent: { to: string; msg: unknown }[] = [];
    const broker = createRoomMeshBroker({
      sendTo: (to, msg) => sent.push({ to, msg }),
    });
    broker.addPeer("g-a");
    broker.addPeer("g-b");
    sent.length = 0;
    broker.removePeer("g-a");
    expect(sent).toEqual([
      {
        to: "g-b",
        msg: { type: SESSION_MESH_TYPE, v: 1, op: "bye", peerId: "g-a" },
      },
    ]);
  });
});
