/**
 * Host-side session_mesh forwarder. Does not setRemoteDescription.
 */

import {
  buildSessionMeshMessage,
  isSessionMeshMessage,
  type SessionMeshMessage,
} from "@pg/roster/rosterSessionMesh";

export type RoomMeshBroker = {
  addPeer: (peerId: string) => void;
  removePeer: (peerId: string) => void;
  introduce: (peerId: string) => void;
  forward: (fromPeerId: string, data: unknown) => void;
};

export function createRoomMeshBroker(opts: {
  sendTo: (peerId: string, msg: SessionMeshMessage) => void;
}): RoomMeshBroker {
  const peers = new Set<string>();

  function send(peerId: string, msg: SessionMeshMessage): void {
    try {
      opts.sendTo(peerId, msg);
    } catch {
      /* ignore */
    }
  }

  return {
    addPeer(peerId) {
      if (!peerId) return;
      peers.add(peerId);
    },
    removePeer(peerId) {
      peers.delete(peerId);
      for (const other of peers) {
        send(other, buildSessionMeshMessage({ op: "bye", peerId }));
      }
    },
    introduce(peerId) {
      if (!peers.has(peerId)) return;
      for (const other of peers) {
        if (other === peerId) continue;
        send(peerId, buildSessionMeshMessage({ op: "hello", peerId: other }));
        send(other, buildSessionMeshMessage({ op: "hello", peerId }));
      }
    },
    forward(fromPeerId, data) {
      if (!isSessionMeshMessage(data)) return;
      if (data.op === "hello" || data.op === "bye") return;
      const to = data.to;
      if (!to || to === fromPeerId || !peers.has(to)) return;
      send(to, {
        ...data,
        from: fromPeerId,
      });
    },
  };
}
