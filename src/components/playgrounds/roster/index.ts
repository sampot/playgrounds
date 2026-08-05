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
  SESSION_SEAT_BOUND_KIND,
  SESSION_ACT_KIND,
  SESSION_ACT_RESULT_KIND,
  SESSION_EVENT_KIND,
  buildSessionInvitePayload,
  isSessionInvitePayload,
  isSessionInviteAcceptPayload,
  isSessionInviteRejectPayload,
  isSessionInviteCancelPayload,
  isSessionInviteKindPayload,
  isSessionSeatBoundPayload,
  isSessionActPayload,
  isSessionActResultPayload,
  isSessionEventRelayPayload,
  isSessionTunnelKindPayload,
  newSessionInviteId,
  newSessionActRequestId,
  sessionInviteToCatalogSpec,
} from "./rosterSessionBridge";
export type {
  RosterSessionProtocolSpec,
  SessionInvitePayload,
  SessionInviteAcceptPayload,
  SessionInviteRejectPayload,
  SessionInviteCancelPayload,
  SessionInviteKindPayload,
  SessionSeatBoundPayload,
  SessionActPayload,
  SessionActResultPayload,
  SessionEventRelayPayload,
  SessionTunnelKindPayload,
} from "./rosterSessionBridge";

export {
  subscribeRosterSessionHub,
  setRosterOpenSession,
  getRosterOpenSession,
  registerRosterRelayTransport,
  registerRosterInviteAcceptedHandler,
  registerRosterRemoteActHandler,
  registerRosterHomeSeatReadyHandler,
  inviteRosterAvatarToSession,
  notifyRosterInviteAccepted,
  notifyRosterRemoteAct,
  notifyRosterHomeSeatReady,
  getRosterProjectionSandboxId,
  getRosterConnectedPeerId,
  sendRosterRelayPayload,
  sendSessionSeatBound,
  rosterCanInviteToSession,
  rosterInvitePeerAvailable,
} from "./rosterSessionInviteHub";
export type {
  RosterSessionOpenSnapshot,
  RosterInviteAcceptedEvent,
  RosterRemoteActRequest,
  RosterHomeSeatReadyEvent,
} from "./rosterSessionInviteHub";

export {
  requestSessionActOverRelay,
  resolveSessionActResult,
  buildSessionActResultPayload,
  clearSessionActPendingForTests,
  DEFAULT_SESSION_ACT_TIMEOUT_MS,
} from "./rosterSessionActTunnel";

export {
  createRosterSessionTunnelBridge,
  publishRosterRelayedSessionEvent,
  applySessionActResultFromRelay,
  bindingFromSeatBound,
} from "./rosterHomeSessionTunnel";
export type {
  RosterHomeSeatBinding,
  RosterTunnelSend,
} from "./rosterHomeSessionTunnel";

export {
  materializeRosterInviteSeat,
  RosterInviteMaterializeError,
} from "./rosterInviteSeatMaterialize";
export type {
  RosterSeatMaterializeResult,
  RosterSeatMaterializeVia,
  RosterSeatMaterializeDeps,
} from "./rosterInviteSeatMaterialize";

export {
  ROSTER_INVITE_HASH_KEY,
  buildRosterInviteUrl,
  extractRosterWireFromText,
  parseRosterInviteFromLocation,
  hasRosterInviteInLocation,
  clearRosterInviteHashFromLocation,
} from "./rosterInviteUrl";
export type { RosterInviteFromLocation } from "./rosterInviteUrl";

export {
  startRosterCameraQrScan,
  rosterCameraScanSupported,
  detectRosterQrFromVideoFrame,
} from "./rosterQrCamera";
export type {
  RosterCameraScanStop,
  RosterCameraDetectDeps,
} from "./rosterQrCamera";
