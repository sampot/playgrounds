import {
  applyRosterAnswer,
  createRosterOffer,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";
import {
  BOOTH_PEER_SIGNAL_PREFIX,
  buildLocalEngineEndpoints,
  type BoothLocalEngineEndpoints,
} from "./boothLocalEngine";

export type BoothPeerJoinResult = {
  session: RosterPeerSession;
  peerId: string;
};

export type BoothPeerClient = {
  join(): Promise<BoothPeerJoinResult>;
  stop(): void;
};

export function createBoothPeerClient(opts: {
  peerCap: string;
  hubBaseUrl?: string;
  endpoints?: BoothLocalEngineEndpoints;
  label?: string;
  localPresence: { agentId: string; name: string };
  handlers: RosterPeerHandlers;
  fetchImpl?: typeof fetch;
}): BoothPeerClient {
  const endpoints = opts.endpoints ?? buildLocalEngineEndpoints();
  const base = (opts.hubBaseUrl ?? endpoints.httpOrigin).replace(/\/+$/, "");
  const signalUrl = `${base}${BOOTH_PEER_SIGNAL_PREFIX}/offer`;
  const fetchFn = opts.fetchImpl ?? fetch;
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
      const res = await fetchFn(signalUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.peerCap.trim()}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          offerWire,
          label: opts.label,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        answerWire?: string;
        peerId?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `peer_join_${res.status}`);
      }
      if (!data.answerWire?.trim()) {
        throw new Error("peer_join_invalid");
      }
      await applyRosterAnswer(session, data.answerWire);
      return {
        session,
        peerId: data.peerId?.trim() || opts.localPresence.agentId,
      };
    },
    stop() {
      stopped = true;
    },
  };
}
