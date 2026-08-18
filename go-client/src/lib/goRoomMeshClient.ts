/**
 * Guest-side session_mesh: build a 2+2＋DC peer to another guest.
 * Fail → caller keeps using Host star for files／media.
 */

import {
  acceptRosterOffer,
  applyRosterAnswer,
  createRosterOffer,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  buildSessionMeshMessage,
  isSessionMeshMessage,
  shouldOfferMesh,
  type SessionMeshMessage,
} from "@pg/roster/rosterSessionMesh";

export type RoomMeshClient = {
  onHostMessage: (data: unknown) => Promise<void>;
  sendBinary: (peerId: string, buf: ArrayBuffer) => boolean;
  bufferedAmount: (peerId: string) => number;
  hasDirect: (peerId: string) => boolean;
  knownPeerIds: () => string[];
  sessionFor: (peerId: string) => RosterPeerSession | null;
  dispose: () => void;
};

type Pending = {
  session: RosterPeerSession;
  remoteId: string;
};

export function createRoomMeshClient(opts: {
  localAgentId: string;
  localName: string;
  sendToHost: (msg: SessionMeshMessage) => void;
  createOffer?: typeof createRosterOffer;
  acceptOffer?: typeof acceptRosterOffer;
  applyAnswer?: typeof applyRosterAnswer;
  onDirectOpen?: (peerId: string, session: RosterPeerSession) => void;
  onDirectClose?: (peerId: string) => void;
  onRosterChange?: () => void;
  onBinary?: (peerId: string, buf: ArrayBuffer) => void;
}): RoomMeshClient {
  const createOffer = opts.createOffer ?? createRosterOffer;
  const acceptOffer = opts.acceptOffer ?? acceptRosterOffer;
  const applyAnswer = opts.applyAnswer ?? applyRosterAnswer;
  const pending = new Map<string, Pending>();
  const open = new Map<string, RosterPeerSession>();
  const known = new Set<string>();

  function sendHost(msg: SessionMeshMessage): void {
    try {
      opts.sendToHost(msg);
    } catch {
      /* ignore */
    }
  }

  function drop(peerId: string, failed: boolean): void {
    const sess = pending.get(peerId)?.session ?? open.get(peerId);
    pending.delete(peerId);
    open.delete(peerId);
    if (sess) {
      try {
        sess.close();
      } catch {
        /* ignore */
      }
    }
    opts.onDirectClose?.(peerId);
    if (failed) {
      sendHost(
        buildSessionMeshMessage({
          op: "fail",
          from: opts.localAgentId,
          to: peerId,
        })
      );
    }
  }

  function markOpen(peerId: string, session: RosterPeerSession): void {
    pending.delete(peerId);
    const already = open.get(peerId) === session;
    open.set(peerId, session);
    if (!already) opts.onDirectOpen?.(peerId, session);
  }

  function handlers(remoteId: string) {
    return {
      onChannelOpen: () => {
        const sess = pending.get(remoteId)?.session ?? open.get(remoteId);
        if (sess) markOpen(remoteId, sess);
      },
      onChannelClose: () => {
        drop(remoteId, false);
      },
      onConnectionState: (state: RTCPeerConnectionState) => {
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
          drop(remoteId, state === "failed");
        }
      },
      onBinary: (buf: ArrayBuffer) => {
        opts.onBinary?.(remoteId, buf);
      },
      onError: () => {
        if (!open.has(remoteId)) drop(remoteId, true);
      },
    };
  }

  async function startOffer(remoteId: string): Promise<void> {
    if (pending.has(remoteId) || open.has(remoteId)) return;
    try {
      const result = await createOffer({
        transport: "signal",
        media: "ready",
        localPresence: {
          agentId: opts.localAgentId,
          name: opts.localName,
        },
        handlers: handlers(remoteId),
      });
      pending.set(remoteId, { session: result.session, remoteId });
      if (result.session.getChannel()?.readyState === "open") {
        markOpen(remoteId, result.session);
      }
      sendHost(
        buildSessionMeshMessage({
          op: "offer",
          from: opts.localAgentId,
          to: remoteId,
          sdp: result.wire,
        })
      );
    } catch {
      drop(remoteId, true);
    }
  }

  async function takeOffer(from: string, sdp: string): Promise<void> {
    if (open.has(from) || pending.has(from)) return;
    try {
      const result = await acceptOffer({
        offerWire: sdp,
        transport: "signal",
        media: "ready",
        localPresence: {
          agentId: opts.localAgentId,
          name: opts.localName,
        },
        handlers: handlers(from),
      });
      pending.set(from, { session: result.session, remoteId: from });
      if (result.session.getChannel()?.readyState === "open") {
        markOpen(from, result.session);
      }
      sendHost(
        buildSessionMeshMessage({
          op: "answer",
          from: opts.localAgentId,
          to: from,
          sdp: result.wire,
        })
      );
    } catch {
      drop(from, true);
    }
  }

  return {
    async onHostMessage(data) {
      if (!isSessionMeshMessage(data)) return;
      if (data.op === "hello") {
        const remoteId = data.peerId;
        if (!remoteId || remoteId === opts.localAgentId) return;
        known.add(remoteId);
        opts.onRosterChange?.();
        if (!shouldOfferMesh(opts.localAgentId, remoteId)) return;
        await startOffer(remoteId);
        return;
      }
      if (data.op === "bye") {
        const remoteId = data.peerId;
        if (!remoteId) return;
        known.delete(remoteId);
        drop(remoteId, false);
        opts.onRosterChange?.();
        return;
      }
      if (data.to && data.to !== opts.localAgentId) return;
      if (data.op === "offer" && data.from && data.sdp) {
        await takeOffer(data.from, data.sdp);
        return;
      }
      if (data.op === "answer" && data.from && data.sdp) {
        const sess =
          pending.get(data.from)?.session ?? open.get(data.from);
        if (!sess) return;
        try {
          await applyAnswer(sess, data.sdp);
          if (sess.getChannel()?.readyState === "open") {
            markOpen(data.from, sess);
          }
        } catch {
          drop(data.from, true);
        }
        return;
      }
      if (data.op === "fail" && data.from) {
        drop(data.from, false);
      }
    },
    sendBinary(peerId, buf) {
      const ch = open.get(peerId)?.getChannel();
      if (!ch || ch.readyState !== "open") return false;
      try {
        ch.send(buf);
        return true;
      } catch {
        return false;
      }
    },
    bufferedAmount(peerId) {
      return open.get(peerId)?.getChannel()?.bufferedAmount ?? 0;
    },
    hasDirect(peerId) {
      const ch = open.get(peerId)?.getChannel();
      return Boolean(ch && ch.readyState === "open");
    },
    knownPeerIds() {
      return [...known];
    },
    sessionFor(peerId) {
      return open.get(peerId) ?? null;
    },
    dispose() {
      for (const id of [...pending.keys(), ...open.keys()]) {
        drop(id, false);
      }
    },
  };
}
