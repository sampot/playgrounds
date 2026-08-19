export {
  ROSTER_SDP_TPL,
  ROSTER_SDP_TPL_AV,
  extractSdpFields,
  prepareFieldsForExchange,
  rebuildSdpFromFields,
  filterCandidatesForLan,
  filterSdpCandidateLines,
  isLanCandidateAddress,
  isLanCandidateIp,
  sdpHasAvMediaLines,
  sdpHasBoothMediaLines,
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
  ROSTER_WIRE_MAX_CHARS_SIGNAL,
  encodeSdpToRosterWire,
  encodeFieldsToRosterWire,
  encodeSessionSdpToRosterWire,
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
  iceServersIncludeTurn,
  buildRosterRtcConfiguration,
  reserveRosterMediaTransceivers,
  reserveBoothMediaTransceivers,
} from "./rosterPeer";
export type {
  RosterPeerSession,
  RosterPeerHandlers,
  RosterPresenceMsg,
  RosterAvatarRelayMsg,
  RosterWireTransport,
  RosterMediaMode,
} from "./rosterPeer";

export {
  BOOTH_TRANSCEIVER_SLOTS,
  boothTransceiverIndex,
  boothSlotOfIndex,
  boothTransceiverOf,
  replaceBoothTrack,
  applyBoothVideoCodecPreferences,
  boothVideoCodecPreferences,
} from "./rosterBoothMedia";
export type {
  BoothMediaLayer,
  BoothMediaKind,
  BoothTransceiverPc,
} from "./rosterBoothMedia";

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

export {
  SESSION_CHAT_TYPE,
  SESSION_CHAT_VERSION,
  SESSION_CHAT_MAX_TEXT_CHARS,
  SESSION_CHAT_MAX_TIMELINE,
  SESSION_CHAT_TOAST_FULL_CHARS,
  SESSION_CHAT_DEFAULT_QUICK_REPLIES,
  SESSION_CHAT_HINTS_TYPE,
  SESSION_CHAT_HOST_DISPLAY_NAME,
  isSessionChatMessage,
  isSessionChatHostMessage,
  normalizeSessionChatText,
  buildSessionChatMessage,
  broadcastSessionChat,
  formatSessionChatToast,
  resolveSessionChatFreeText,
  resolveSessionChatQuickReplies,
  normalizeSessionChatHints,
  parseSessionChatHintsMessage,
  sessionChatPhaseFromEvent,
  trimSessionChatTimeline,
} from "./rosterSessionChat";
export type {
  SessionChatMsg,
  SessionChatHints,
  SessionChatSendTarget,
  SessionChatUiPhase,
  SessionChatRole,
} from "./rosterSessionChat";

export {
  SESSION_FILE_TYPE,
  SESSION_FILE_VERSION,
  SESSION_FILE_CATALOG_ID,
  SESSION_FILE_MAX_BYTES,
  SESSION_FILE_CHUNK_PAYLOAD_MAX,
  isBlockedSessionFileName,
  isSessionFileControl,
  isSessionFileBroadcastOp,
  normalizeSessionFileShare,
  buildSessionFileControl,
  sessionFileChunkCount,
  encodeSessionFileChunk,
  decodeSessionFileChunk,
} from "./rosterSessionFile";
export type {
  SessionFileOp,
  SessionFileControl,
  SessionFileChunk,
  SessionFileShareItem,
} from "./rosterSessionFile";

export {
  SESSION_MESH_TYPE,
  SESSION_MESH_VERSION,
  isSessionMeshMessage,
  buildSessionMeshMessage,
  shouldOfferMesh,
} from "./rosterSessionMesh";
export type {
  SessionMeshOp,
  SessionMeshMessage,
} from "./rosterSessionMesh";

export {
  SESSION_CAST_TYPE,
  SESSION_CAST_VERSION,
  isSessionCastMessage,
  buildSessionCastMessage,
} from "./rosterSessionCast";
export type {
  SessionCastOp,
  SessionCastKind,
  SessionCastMessage,
} from "./rosterSessionCast";

export {
  SESSION_CAMERA_TYPE,
  SESSION_CAMERA_VERSION,
  isSessionCameraMessage,
  buildSessionCameraMessage,
} from "./rosterSessionCamera";
export type {
  SessionCameraOp,
  SessionCameraMessage,
} from "./rosterSessionCamera";
