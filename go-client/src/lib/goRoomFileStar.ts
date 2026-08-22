/**
 * Host-side star routing for 包廂 files.
 * Catalog ops fanout; bytes only Owner → Requester. Host never assembles.
 */

import {
  SESSION_FILE_CATALOG_ID,
  buildSessionFileControl,
  decodeSessionFileChunk,
  isSessionFileBroadcastOp,
  isSessionFileControl,
  type SessionFileControl,
  type SessionFileShareItem,
} from "@pg/roster/rosterSessionFile";

export type RoomFileStarPeer = {
  peerId: string;
  sendJson: (msg: SessionFileControl) => void;
  sendBinary: (buf: ArrayBuffer) => void;
  bufferedAmount: () => number;
};

export type RoomFileStarHub = {
  addPeer: (peer: RoomFileStarPeer) => void;
  removePeer: (peerId: string) => void;
  onPeerControl: (fromPeerId: string, data: unknown) => void;
  onPeerBinary: (fromPeerId: string, buf: ArrayBuffer) => void;
  outboundControl: (msg: SessionFileControl) => void;
  outboundBinary: (buf: ArrayBuffer) => void;
  requesterBufferedAmount: (destPeerId?: string) => number;
};

export function createRoomFileStarHub(opts: {
  localAgentId: string;
  listingOwner: (fileId: string) => string | null;
  catalogItems: () => SessionFileShareItem[];
  applyControl: (data: SessionFileControl) => void;
  applyBinary: (buf: ArrayBuffer) => void;
  forgetOwner: (ownerId: string) => string[];
}): RoomFileStarHub {
  const peers = new Map<string, RoomFileStarPeer>();
  const transfers = new Map<
    string,
    { fileId: string; ownerId: string; requesterId: string }
  >();

  function sendJson(peerId: string, msg: SessionFileControl): void {
    try {
      peers.get(peerId)?.sendJson(msg);
    } catch {
      /* ignore */
    }
  }

  function sendBin(peerId: string, buf: ArrayBuffer): void {
    try {
      peers.get(peerId)?.sendBinary(buf);
    } catch {
      /* ignore */
    }
  }

  function broadcast(msg: SessionFileControl, except?: string): void {
    for (const [id, p] of peers) {
      if (id === except) continue;
      try {
        p.sendJson(msg);
      } catch {
        /* ignore */
      }
    }
  }

  function cancelTransfer(
    transferId: string,
    t: { fileId: string; ownerId: string; requesterId: string },
    exceptPeer?: string
  ): void {
    transfers.delete(transferId);
    const msg = buildSessionFileControl({
      op: "cancel",
      id: t.fileId,
      transferId,
    });
    for (const id of [t.ownerId, t.requesterId]) {
      if (id === exceptPeer) continue;
      if (id === opts.localAgentId) opts.applyControl(msg);
      else sendJson(id, msg);
    }
  }

  return {
    addPeer(peer) {
      peers.set(peer.peerId, peer);
      sendJson(
        peer.peerId,
        buildSessionFileControl({
          op: "catalog",
          id: SESSION_FILE_CATALOG_ID,
          items: opts.catalogItems(),
        })
      );
    },
    removePeer(peerId) {
      peers.delete(peerId);
      const ids = opts.forgetOwner(peerId);
      for (const id of ids) {
        broadcast(buildSessionFileControl({ op: "unshare", id }));
      }
      for (const [tid, t] of [...transfers]) {
        if (t.ownerId === peerId || t.requesterId === peerId) {
          cancelTransfer(tid, t, peerId);
        }
      }
    },
    onPeerControl(fromPeerId, data) {
      if (!isSessionFileControl(data)) return;
      if (isSessionFileBroadcastOp(data.op)) {
        opts.applyControl(data);
        broadcast(data, fromPeerId);
        return;
      }
      if (data.op === "request") {
        const ownerId = opts.listingOwner(data.id);
        const transferId = data.transferId;
        if (!transferId || !ownerId) {
          sendJson(
            fromPeerId,
            buildSessionFileControl({
              op: "reject",
              id: data.id,
              transferId: transferId || "unknown",
            })
          );
          return;
        }
        transfers.set(transferId, {
          fileId: data.id,
          ownerId,
          requesterId: fromPeerId,
        });
        if (ownerId === opts.localAgentId) {
          opts.applyControl(data);
        } else {
          sendJson(ownerId, data);
        }
        return;
      }
      const t = data.transferId ? transfers.get(data.transferId) : undefined;
      if (!t) {
        opts.applyControl(data);
        return;
      }
      const other =
        fromPeerId === t.ownerId ? t.requesterId : t.ownerId;
      if (other === opts.localAgentId) opts.applyControl(data);
      else sendJson(other, data);
      if (
        data.op === "done" ||
        data.op === "reject" ||
        data.op === "cancel"
      ) {
        transfers.delete(data.transferId!);
      }
    },
    onPeerBinary(_fromPeerId, buf) {
      const chunk = decodeSessionFileChunk(buf);
      if (!chunk) return;
      const t = transfers.get(chunk.transferId);
      if (!t) return;
      if (t.requesterId === opts.localAgentId) {
        opts.applyBinary(buf instanceof ArrayBuffer ? buf : buf);
        return;
      }
      sendBin(t.requesterId, buf instanceof ArrayBuffer ? buf : buf.slice(0));
    },
    outboundControl(msg) {
      if (isSessionFileBroadcastOp(msg.op)) {
        broadcast(msg);
        return;
      }
      if (msg.op === "request") {
        const ownerId = opts.listingOwner(msg.id);
        if (msg.transferId && ownerId) {
          transfers.set(msg.transferId, {
            fileId: msg.id,
            ownerId,
            requesterId: opts.localAgentId,
          });
          sendJson(ownerId, msg);
        }
        return;
      }
      const t = msg.transferId ? transfers.get(msg.transferId) : undefined;
      if (!t) return;
      const dest =
        t.ownerId === opts.localAgentId ? t.requesterId : t.ownerId;
      if (dest !== opts.localAgentId) sendJson(dest, msg);
      if (msg.op === "done" || msg.op === "reject" || msg.op === "cancel") {
        transfers.delete(msg.transferId!);
      }
    },
    outboundBinary(buf) {
      const chunk = decodeSessionFileChunk(buf);
      if (!chunk) return;
      const t = transfers.get(chunk.transferId);
      if (!t) return;
      const dest =
        t.ownerId === opts.localAgentId ? t.requesterId : t.ownerId;
      if (dest !== opts.localAgentId) sendBin(dest, buf);
    },
    requesterBufferedAmount(destPeerId?: string) {
      if (destPeerId) {
        return peers.get(destPeerId)?.bufferedAmount() ?? 0;
      }
      let max = 0;
      let any = false;
      for (const t of transfers.values()) {
        if (t.ownerId !== opts.localAgentId) continue;
        any = true;
        const n = peers.get(t.requesterId)?.bufferedAmount() ?? 0;
        if (n > max) max = n;
      }
      return any ? max : 0;
    },
  };
}
