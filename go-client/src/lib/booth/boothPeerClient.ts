import {
  applyRosterAnswer,
  createRosterOffer,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import { joinEmbeddedHubViaSignal } from "./boothPeerSignal";

export type BoothPeerJoinResult = {
  session: RosterPeerSession;
  peerId: string;
};

export type BoothPeerClient = {
  join(): Promise<BoothPeerJoinResult>;
  stop(): void;
};

/** Join the embedded Booth Hub on this origin via BroadcastChannel (same browser as `/room`). */
export function createBoothPeerClient(opts: {
  peerCap: string;
  embeddedHubSessionId: string;
  embeddedSignalTimeoutMs?: number;
  label?: string;
  localPresence: { agentId: string; name: string };
  handlers: RosterPeerHandlers;
}): BoothPeerClient {
  const hubSessionId = opts.embeddedHubSessionId.trim();
  if (!hubSessionId) {
    throw new Error("embedded_hub_required");
  }
  let stopped = false;

  async function createOfferWire(): Promise<{
    wire: string;
    session: RosterPeerSession;
  }> {
    return createRosterOffer({
      transport: "signal",
      media: "ready",
      localPresence: opts.localPresence,
      handlers: opts.handlers,
    });
  }

  return {
    async join() {
      if (stopped) throw new Error("peer_stopped");
      const { wire: offerWire, session } = await createOfferWire();
      const embedded = await joinEmbeddedHubViaSignal({
        peerCap: opts.peerCap,
        hubSessionId,
        offerWire,
        label: opts.label,
        timeoutMs: opts.embeddedSignalTimeoutMs,
      });
      await applyRosterAnswer(session, embedded.answerWire);
      return {
        session,
        peerId: embedded.peerId?.trim() || opts.localPresence.agentId,
      };
    },
    stop() {
      stopped = true;
    },
  };
}

/** Convenience: join embedded hub as peer (web `/room/peer` only). */
export async function joinBoothAsPeer(
  opts: Parameters<typeof createBoothPeerClient>[0]
): Promise<BoothPeerJoinResult> {
  const client = createBoothPeerClient(opts);
  try {
    return await client.join();
  } finally {
    client.stop();
  }
}
