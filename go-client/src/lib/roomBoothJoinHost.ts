import {
  acceptRosterOffer,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "@pg/roster/rosterPeer";

export function createRoomGuestJoinAcceptor(opts: {
  localAgentId: string;
  hostName: () => string;
  prepareHandlers: () => {
    handlers: RosterPeerHandlers;
    attachSession: (session: RosterPeerSession) => void;
  };
}): (offerWire: string) => Promise<string> {
  return async (offerWire: string) => {
    const prepared = opts.prepareHandlers();
    const { session, wire } = await acceptRosterOffer({
      offerWire,
      transport: "signal",
      media: "ready",
      localPresence: {
        agentId: opts.localAgentId,
        name: opts.hostName(),
      },
      handlers: prepared.handlers,
    });
    prepared.attachSession(session);
    return wire;
  };
}
