export {
  ROSTER_SDP_TPL,
  extractSdpFields,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
  filterCandidatesForLan,
  isLanCandidateAddress,
  isLanCandidateIp,
  RosterSdpError,
} from "./rosterSdpCodec";
export type {
  RosterSdpFields,
  RosterSdpRole,
  RosterIceCandidate,
} from "./rosterSdpCodec";

export {
  ROSTER_WIRE_VERSION,
  ROSTER_WIRE_MAX_CHARS,
  encodeSdpToRosterWire,
  encodeFieldsToRosterWire,
  decodeRosterWire,
  decodeRosterWireToSdp,
  RosterWireError,
} from "./rosterWire";

export {
  createRosterOffer,
  acceptRosterOffer,
  applyRosterAnswer,
  isPresenceMessage,
} from "./rosterPeer";
export type {
  RosterPeerSession,
  RosterPeerHandlers,
  RosterPresenceMsg,
} from "./rosterPeer";

export { drawIdenticon, identiconDataUrl } from "./rosterIdenticon";

export {
  encodeRosterQrPng,
  encodeRosterQrPngDataUrl,
  decodeRosterQrFromImage,
  decodeRosterQrFromBlob,
  RosterQrError,
} from "./rosterQr";

export {
  subscribeRosterAvatars,
  listRosterAvatars,
  upsertRosterAvatar,
  removeRosterAvatar,
  clearRosterAvatars,
  setRosterAvatarConnectionState,
} from "./rosterStore";
export type { RosterAvatarStub } from "./rosterStore";
