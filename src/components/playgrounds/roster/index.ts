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
  isAvatarRelayMessage,
} from "./rosterPeer";
export type {
  RosterPeerSession,
  RosterPeerHandlers,
  RosterPresenceMsg,
  RosterAvatarRelayMsg,
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
  getRosterAvatar,
  upsertRosterAvatar,
  removeRosterAvatar,
  clearRosterAvatars,
  setRosterAvatarConnectionState,
  setRosterAvatarSandboxId,
} from "./rosterStore";
export type { RosterAvatarStub } from "./rosterStore";

export {
  createAvatarProjectionStarterFiles,
  AVATAR_PROJECTION_STARTER_TITLE,
  ROSTER_AVATAR_BRIDGE,
} from "./avatarProjectionStarter";
export type { AvatarProjectionOpts } from "./avatarProjectionStarter";

export {
  spawnRosterAvatarProjection,
  teardownRosterAvatarProjection,
  ROSTER_AVATAR_SOURCE,
} from "./rosterAvatarHost";
export type {
  SpawnRosterAvatarInput,
  SpawnRosterAvatarResult,
} from "./rosterAvatarHost";

export {
  SESSION_INVITE_KIND,
  SESSION_INVITE_ACCEPT_KIND,
  SESSION_INVITE_REJECT_KIND,
  SESSION_INVITE_CANCEL_KIND,
  buildSessionInvitePayload,
  isSessionInvitePayload,
  isSessionInviteAcceptPayload,
  isSessionInviteRejectPayload,
  isSessionInviteCancelPayload,
  isSessionInviteKindPayload,
  newSessionInviteId,
  sessionInviteToCatalogSpec,
} from "./rosterSessionBridge";
export type {
  RosterSessionProtocolSpec,
  SessionInvitePayload,
  SessionInviteAcceptPayload,
  SessionInviteRejectPayload,
  SessionInviteCancelPayload,
  SessionInviteKindPayload,
} from "./rosterSessionBridge";

export {
  subscribeRosterSessionHub,
  setRosterOpenSession,
  getRosterOpenSession,
  registerRosterRelayTransport,
  registerRosterInviteAcceptedHandler,
  inviteRosterAvatarToSession,
  notifyRosterInviteAccepted,
  getRosterProjectionSandboxId,
  rosterCanInviteToSession,
  rosterInvitePeerAvailable,
} from "./rosterSessionInviteHub";
export type {
  RosterSessionOpenSnapshot,
  RosterInviteAcceptedEvent,
} from "./rosterSessionInviteHub";
