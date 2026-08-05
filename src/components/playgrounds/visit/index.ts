export {
  VISIT_SDP_TPL,
  extractSdpFields,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
  filterCandidatesForLan,
  isLanCandidateAddress,
  isLanCandidateIp,
  VisitSdpError,
} from "./visitSdpCodec";
export type {
  VisitSdpFields,
  VisitSdpRole,
  VisitIceCandidate,
} from "./visitSdpCodec";

export {
  VISIT_WIRE_VERSION,
  VISIT_WIRE_MAX_CHARS,
  encodeSdpToVisitWire,
  encodeFieldsToVisitWire,
  decodeVisitWire,
  decodeVisitWireToSdp,
  VisitWireError,
} from "./visitWire";

export {
  createVisitOffer,
  acceptVisitOffer,
  applyVisitAnswer,
  isPresenceMessage,
} from "./visitPeer";
export type {
  VisitPeerSession,
  VisitPeerHandlers,
  VisitPresenceMsg,
} from "./visitPeer";

export { drawIdenticon, identiconDataUrl } from "./visitIdenticon";

export {
  encodeVisitQrPng,
  encodeVisitQrPngDataUrl,
  decodeVisitQrFromImage,
  decodeVisitQrFromBlob,
  VisitQrError,
} from "./visitQr";

export {
  subscribeVisitAvatars,
  listVisitAvatars,
  upsertVisitAvatar,
  removeVisitAvatar,
  clearVisitAvatars,
  setVisitAvatarConnectionState,
} from "./visitStore";
export type { VisitAvatarStub } from "./visitStore";
