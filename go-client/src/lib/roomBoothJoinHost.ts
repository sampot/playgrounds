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

export function createRoomPeerJoinAcceptor(opts: {
  localAgentId: string;
  hostName: () => string;
  prepareHandlers: (label?: string) => {
    handlers: RosterPeerHandlers;
    attachSession: (session: RosterPeerSession) => void;
    peerId: string;
  };
}): (
  offerWire: string,
  label?: string
) => Promise<{ answerWire: string; peerId: string }> {
  return async (offerWire: string, label?: string) => {
    const prepared = opts.prepareHandlers(label);
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
    return { answerWire: wire, peerId: prepared.peerId };
  };
}
