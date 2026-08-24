import type { BoothEnvelope } from "@pg/roster/boothChannel";
import type { BoothIntent } from "./boothHubEngine";

/** Map hub intent → Control Channel wire frame (ENGINE §7.2). */
export function boothIntentToWire(
  intent: BoothIntent,
  requestId?: string
): BoothEnvelope {
  const base = { v: 1 as const, ...(requestId ? { id: requestId } : {}) };
  switch (intent.type) {
    case "invite.mint":
      return { ...base, type: "booth.intent.invite.mint" };
    case "invite.revoke":
      return { ...base, type: "booth.intent.invite.revoke" };
    case "cast.offer":
      return {
        ...base,
        type: "booth.intent.cast.offer",
        payload: intent.payload,
      };
    case "cast.unoffer":
      return { ...base, type: "booth.intent.cast.unoffer" };
    case "cast.state":
      return {
        ...base,
        type: "booth.intent.cast.state",
        payload: intent.payload,
      };
    case "peer.mint":
      return {
        ...base,
        type: "booth.intent.peer.mint",
        label: intent.label,
        ttlSec: intent.ttlSec,
      };
    case "peer.revoke":
      return {
        ...base,
        type: "booth.intent.peer.revoke",
        peerCapId: intent.peerCapId,
      };
    case "ejectPeer":
      return {
        ...base,
        type: "booth.intent.ejectPeer",
        peerId: intent.peerId,
      };
    case "private.import":
      return {
        ...base,
        type: "booth.intent.private.import",
        payload: {
          name: intent.name,
          size: intent.size,
          mime: intent.mime,
        },
      };
    case "private.remove":
      return {
        ...base,
        type: "booth.intent.private.remove",
        payload: { id: intent.id },
      };
    case "private.mountToShare":
      return {
        ...base,
        type: "booth.intent.private.mountToShare",
        payload: { id: intent.id },
      };
    case "private.fetch":
      return {
        ...base,
        type: "booth.intent.private.fetch",
        payload: { id: intent.id },
      };
    case "share.import":
      return {
        ...base,
        type: "booth.intent.share.import",
        payload: {
          name: intent.name,
          size: intent.size,
          mime: intent.mime,
        },
      };
    case "share.unshare":
      return {
        ...base,
        type: "booth.intent.share.unshare",
        payload: { id: intent.id },
      };
    case "share.fetch":
      return {
        ...base,
        type: "booth.intent.share.fetch",
        payload: { id: intent.id },
      };
    case "share.rescan":
      return { ...base, type: "booth.intent.share.rescan" };
    case "end":
      return { ...base, type: "booth.intent.end" };
    default:
      return { ...base, type: "booth.intent.invalid" };
  }
}
