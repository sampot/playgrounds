/**
 * 包廂在場／節目媒體：replaceTrack on booth 2+2。
 * 節目＝房級大螢幕；在場聲＝開麥即送（星狀下 Host 混音，§9.8.1）；在場影像仍要 request。
 */

import {
  boothSlotOfIndex,
  boothTransceiverOf,
  replaceBoothTrack,
  type BoothMediaKind,
  type BoothMediaLayer,
  type BoothTransceiverPc,
} from "@pg/roster/rosterBoothMedia";
import {
  buildSessionBoothMessage,
  isSessionBoothMessage,
  type SessionBoothMessage,
} from "@pg/roster/rosterSessionBooth";
import {
  buildSessionCastMessage,
  isSessionCastMessage,
  type SessionCastMessage,
} from "@pg/roster/rosterSessionCast";
import {
  buildSessionCameraMessage,
  buildSessionMicMessage,
  isSessionCameraMessage,
  isSessionMicMessage,
  type SessionCameraMessage,
  type SessionMicMessage,
} from "@pg/roster/rosterSessionCamera";
import {
  buildSessionRecordMessage,
  isSessionRecordMessage,
  type SessionRecordMessage,
} from "@pg/roster/rosterSessionRecord";
import {
  GO_ROOM_CAST_UNSUPPORTED,
  GO_ROOM_DISPLAY_PERM_DENIED,
  GO_ROOM_FILE_SW_REQUIRED,
  GO_ROOM_MEDIA_PERM_DENIED,
  allowCanvasProgramCaptureFallback,
  goRoomCastCaptureError,
  htmlMediaCaptureStreamSupported,
} from "./goRoom";
import {
  createPresenceAudioMixer,
  type PresenceAudioSource,
} from "./goRoomPresenceAudioMix";
import { ensureLocalRoomFileRegistered } from "./goRoomPlayBridge";
import { roomFilePath } from "./goRoomPlayRegistry";
import {
  createHostPrivateLibrary,
  type RoomPrivateLibrary,
} from "./goRoomPrivateLibrary";
import {
  applyRecordNotify,
  createPresenceRecordHub,
  type PresenceRecordHub,
} from "./goRoomPresenceRecord";

export type RoomMediaPeer = {
  peerId: string;
  pc: BoothTransceiverPc;
  via: "entrance" | "mesh";
};

export type RoomRemoteLive = {
  peerId: string;
  camera: boolean;
  mic: boolean;
};

export type RoomMediaState = {
  camera: boolean;
  mic: boolean;
  display: boolean;
  programName: string | null;
  remoteProgramName: string | null;
  remoteProgramKind: "audio" | "video" | null;
  presenceStream: MediaStream | null;
  programStream: MediaStream | null;
  localProgramStream: MediaStream | null;
  localPreviewStream: MediaStream | null;
  ownerDecodeUrl: string | null;
  ownerDecodeKind: "audio" | "video" | null;
  programTransport: boolean;
  programPaused: boolean;
  programTime: number;
  programDuration: number;
  error: string | null;
  cameraBlocked: boolean;
  remoteCameraOffered: boolean;
  watching: boolean;
  remoteMicOffered: boolean;
  listening: boolean;
  watchingProgram: boolean;
  remoteLives: RoomRemoteLive[];
  /** Occupant whose live is on the TV; null when no signal or a file. */
  tvSourcePeerId: string | null;
  /** Catalog file currently on the TV (local capture or remote offer id). */
  streamingFileId: string | null;
  /** Host mid capture／offer for this file id (UI「推送中…」). */
  castingFileId: string | null;
  /** share｜private when a file is on the TV; null for live／off. */
  programScope: "share" | "private" | null;
  /** Peers with an active Hub recording tap (PG-GO-ROOM-RECORD-PLAN). */
  recordingPeerIds: string[];
};

export type RoomMediaResult =
  | { ok: true }
  | { ok: false; error: string };

export type RoomProgramClock = {
  paused: boolean;
  currentTime: number;
  duration: number;
};

type CapturedProgram = {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  stop: () => void;
  play?: () => void;
  pause?: () => void;
  seek?: (seconds: number) => void;
  clock?: () => RoomProgramClock | null;
  mediaEl?: HTMLMediaElement;
};

function clockFromElement(el: HTMLMediaElement): RoomProgramClock {
  const d = el.duration;
  return {
    paused: el.paused,
    currentTime: Number.isFinite(el.currentTime) ? el.currentTime : 0,
    duration: Number.isFinite(d) ? d : 0,
  };
}

function transportFromElement(el: HTMLMediaElement): Pick<
  CapturedProgram,
  "play" | "pause" | "seek" | "clock" | "mediaEl"
> {
  return {
    mediaEl: el,
    play() {
      try {
        const played = el.play();
        if (played && typeof played.catch === "function") void played.catch(() => {});
      } catch {
        /* ignore */
      }
    },
    pause() {
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return;
      try {
        el.currentTime = Math.max(0, seconds);
      } catch {
        /* ignore */
      }
    },
    clock: () => clockFromElement(el),
  };
}

export type RoomMediaControl =
  | SessionCastMessage
  | SessionCameraMessage
  | SessionMicMessage
  | SessionBoothMessage
  | SessionRecordMessage;

export type RoomMedia = {
  enableCamera(): Promise<RoomMediaResult>;
  disableCamera(): Promise<void>;
  enableDisplay(): Promise<RoomMediaResult>;
  disableDisplay(): Promise<void>;
  enableMic(): Promise<RoomMediaResult>;
  disableMic(): Promise<void>;
  startProgram(file: File): Promise<RoomMediaResult>;
  startListedProgram(id: string): Promise<RoomMediaResult>;
  /** Host OPFS private library — offer with scope:private; never /room-file. */
  startPrivateProgram(id: string): Promise<RoomMediaResult>;
  stopProgram(): Promise<void>;
  pauseProgram(): void;
  playProgram(): void;
  seekProgram(seconds: number): void;
  putLiveOnTv(peerId: string, name?: string): Promise<RoomMediaResult>;
  startRecording(
    peerId: string,
    displayName?: string,
    label?: string
  ): Promise<RoomMediaResult>;
  stopRecording(peerId: string): Promise<RoomMediaResult>;
  haltLive(
    peerId: string,
    layer: "audio" | "video"
  ): Promise<RoomMediaResult>;
  warmProgram(id: string): Promise<RoomMediaResult>;
  captureFromElement(el: HTMLMediaElement): Promise<RoomMediaResult>;
  stopStreamingFile(id: string): Promise<void>;
  watchCamera(): Promise<RoomMediaResult>;
  watchLive(peerId: string): Promise<RoomMediaResult>;
  stopWatching(): Promise<void>;
  listenMic(): Promise<RoomMediaResult>;
  stopListening(): Promise<void>;
  watchProgram(id?: string): Promise<RoomMediaResult>;
  stopWatchingProgram(): Promise<void>;
  refresh(): Promise<void>;
  forwardFrom(fromPeerId: string): Promise<void>;
  onControl(data: unknown): void | Promise<void>;
  onRemoteTrack(
    ev: { streams?: readonly MediaStream[]; track: MediaStreamTrack; transceiver?: { mid?: string | null } },
    pc: BoothTransceiverPc
  ): void;
  getState(): RoomMediaState;
  subscribe(listener: (s: RoomMediaState) => void): () => void;
  dispose(): void;
};

function receiverTrack(
  pc: BoothTransceiverPc,
  layer: BoothMediaLayer,
  kind: BoothMediaKind
): MediaStreamTrack | null {
  const raw = boothTransceiverOf(pc, layer, kind)?.receiver?.track as
    | MediaStreamTrack
    | null
    | undefined;
  if (!raw || raw.kind !== kind) return null;
  if (raw.readyState && raw.readyState !== "live") return null;
  return raw;
}

function isLiveTrack(t: MediaStreamTrack | null): t is MediaStreamTrack {
  if (!t) return false;
  if (t.readyState && t.readyState !== "live") return false;
  return true;
}

/** Forward a received track without stealing it from the host TV sink. */
function cloneTrackForForward(
  t: MediaStreamTrack | null
): MediaStreamTrack | null {
  if (!t) return null;
  try {
    if (typeof t.clone === "function") return t.clone();
  } catch {
    /* fall through */
  }
  return t;
}

export function createRoomMedia(opts: {
  localAgentId: string;
  occupantCount: () => number;
  peers: () => RoomMediaPeer[];
  sendJson: (msg: RoomMediaControl) => void;
  forward?: boolean;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  captureProgram?: (file: File) => Promise<CapturedProgram | null>;
  /** Tests stub true; production registers File into go SW before `/room-file/` decode. */
  ensureLocalRoomFile?: (id: string, file: File) => Promise<boolean>;
  resolveLocalFile?: (id: string) => File | null;
  /** Async resolve for Host private OPFS ids (`pvt_…`). */
  resolvePrivateFile?: (id: string) => Promise<File | null>;
  ownerOf?: (id: string) => string | null;
  fileMeta?: (id: string) => { name: string; kind: "audio" | "video" } | null;
  onProgramClock?: () => void;
  onRecordingDone?: () => void;
  privateLibrary?: RoomPrivateLibrary;
}): RoomMedia {
  const getUserMedia =
    opts.getUserMedia ??
    ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const getDisplayMedia =
    opts.getDisplayMedia ??
    ((c?: DisplayMediaStreamOptions) =>
      navigator.mediaDevices.getDisplayMedia(c ?? { video: true, audio: false }));
  const ensureLocalRoomFile =
    opts.ensureLocalRoomFile ??
    ((id: string, file: File) => ensureLocalRoomFileRegistered(id, file));
  const listeners = new Set<(s: RoomMediaState) => void>();
  let camera: MediaStreamTrack | null = null;
  let mic: MediaStreamTrack | null = null;
  let liveSource: "camera" | "display" | null = null;
  let program: CapturedProgram | null = null;
  let programName: string | null = null;
  let remoteProgramName: string | null = null;
  let remoteProgramKind: "audio" | "video" | null = null;
  let remoteProgramFileId: string | null = null;
  let remoteProgramFrom: string | null = null;
  let remoteProgramPaused = true;
  let remoteProgramTime = 0;
  let remoteProgramDuration = 0;
  let lastClockPublishMs = 0;
  let lastClockPublishedPaused: boolean | null = null;
  let remoteCameraFrom: string | null = null;
  let remoteMicFrom: string | null = null;
  let programFromLive = false;
  let tvSourcePeerId: string | null = null;
  let remotePresenceVideo: MediaStreamTrack | null = null;
  let remotePresenceAudio: MediaStreamTrack | null = null;
  let remoteProgramVideo: MediaStreamTrack | null = null;
  let remoteProgramAudio: MediaStreamTrack | null = null;
  let error: string | null = null;
  let remoteCameraOffered = false;
  let watching = false;
  let watchingPeerId: string | null = null;
  let remoteMicOffered = false;
  let listening = false;
  let watchingProgram = false;
  let streamingFileId: string | null = null;
  let castingFileId: string | null = null;
  let programScope: "share" | "private" | null = null;
  const cameraWatchers = new Set<string>();
  const micListeners = new Set<string>();
  const programWatchers = new Set<string>();
  let remoteLives: { peerId: string; camera: boolean; mic: boolean }[] = [];
  const recordingNotified = new Set<string>();
  const privateLibrary =
    opts.privateLibrary ??
    (opts.forward ? createHostPrivateLibrary() : null);
  const recorder: PresenceRecordHub | null =
    opts.forward && privateLibrary
      ? createPresenceRecordHub({
          localAgentId: opts.localAgentId,
          privateLibrary,
          getLive: (peerId) => {
            if (peerId === opts.localAgentId) {
              return { camera: Boolean(camera), mic: Boolean(mic) };
            }
            const live = remoteLives.find((l) => l.peerId === peerId);
            return live ? { camera: live.camera, mic: live.mic } : null;
          },
          getPresenceStream: (peerId) => presenceStreamForRecord(peerId),
          sendJson: (msg) => opts.sendJson(msg),
          onRecordingDone: opts.onRecordingDone,
        })
      : null;
  let presenceCache: { ids: string; stream: MediaStream } | null = null;
  let programCache: { ids: string; stream: MediaStream } | null = null;
  let localProgramCache: { ids: string; stream: MediaStream } | null = null;
  let localCache: { ids: string; stream: MediaStream } | null = null;
  const presenceMixer = opts.forward ? createPresenceAudioMixer() : null;

  /** Entrance／Host-star PCs only — mesh is DC file path, never RTP. */
  function rtpPeers(): RoomMediaPeer[] {
    return opts.peers().filter((p) => p.via !== "mesh");
  }

  function presenceStreamForRecord(peerId: string): MediaStream | null {
    if (peerId === opts.localAgentId) {
      const tracks = [camera, mic].filter((t): t is MediaStreamTrack =>
        isLiveTrack(t)
      );
      if (!tracks.length || typeof MediaStream !== "function") return null;
      return new MediaStream(tracks);
    }
    const peer = rtpPeers().find((p) => p.peerId === peerId);
    if (!peer) return null;
    const tracks = [
      receiverTrack(peer.pc, "presence", "video"),
      receiverTrack(peer.pc, "presence", "audio"),
    ].filter((t): t is MediaStreamTrack => isLiveTrack(t));
    if (!tracks.length || typeof MediaStream !== "function") return null;
    return new MediaStream(tracks);
  }

  function recordingPeerIds(): string[] {
    if (recorder) return recorder.recordingPeerIds();
    return [...recordingNotified];
  }

  function collectMicSources(): PresenceAudioSource[] {
    const sources: PresenceAudioSource[] = [];
    if (isLiveTrack(mic)) {
      sources.push({ peerId: opts.localAgentId, track: mic });
    }
    for (const live of remoteLives) {
      if (!live.mic) continue;
      const peer = rtpPeers().find((p) => p.peerId === live.peerId);
      if (!peer) continue;
      const t = receiverTrack(peer.pc, "presence", "audio");
      if (t) sources.push({ peerId: live.peerId, track: t });
    }
    return sources;
  }

  async function pushPresenceAudio(): Promise<void> {
    if (!opts.forward || !presenceMixer) {
      for (const peer of rtpPeers()) {
        if (!peer.peerId) continue;
        const presenceAudio =
          mic && micListeners.has(peer.peerId) ? mic : null;
        await replaceBoothTrack(peer.pc, "presence", "audio", presenceAudio);
      }
      return;
    }
    presenceMixer.setSources(collectMicSources());
    for (const peer of rtpPeers()) {
      if (!peer.peerId) continue;
      if (!micListeners.has(peer.peerId)) {
        await replaceBoothTrack(peer.pc, "presence", "audio", null);
        continue;
      }
      const out = presenceMixer.trackFor(peer.peerId);
      await replaceBoothTrack(peer.pc, "presence", "audio", out);
    }
    const listen = presenceMixer.localListenTrack(opts.localAgentId);
    if (listen) remotePresenceAudio = listen;
  }

  function programClockState(): Pick<
    RoomMediaState,
    "programTransport" | "programPaused" | "programTime" | "programDuration"
  > {
    const clock = program?.clock?.() ?? null;
    if (clock) {
      return {
        programTransport: true,
        programPaused: clock.paused,
        programTime: clock.currentTime,
        programDuration: clock.duration,
      };
    }
    if (streamingFileId || remoteProgramFileId) {
      return {
        // Host HUD: remote file is host-directed even without local capture.
        programTransport: false,
        programPaused: remoteProgramPaused,
        programTime: remoteProgramTime,
        programDuration: remoteProgramDuration,
      };
    }
    return {
      programTransport: false,
      programPaused: true,
      programTime: 0,
      programDuration: 0,
    };
  }

  function clearRemoteProgramClock(): void {
    remoteProgramPaused = true;
    remoteProgramTime = 0;
    remoteProgramDuration = 0;
    lastClockPublishMs = 0;
    lastClockPublishedPaused = null;
  }

  function publishProgramClock(force = false): void {
    const clock = program?.clock?.() ?? null;
    if (!clock || !streamingFileId) return;
    const now =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    // timeupdate is chatty; throttle so Hub DC stays free for files／control.
    if (
      !force &&
      lastClockPublishMs > 0 &&
      now - lastClockPublishMs < 500 &&
      clock.paused === lastClockPublishedPaused
    ) {
      return;
    }
    lastClockPublishMs = now;
    lastClockPublishedPaused = clock.paused;
    opts.sendJson(
      buildSessionCastMessage({
        op: "state",
        from: opts.localAgentId,
        paused: clock.paused,
        t: clock.currentTime,
        duration: clock.duration,
        id: streamingFileId,
        name: programName ?? undefined,
      })
    );
    opts.onProgramClock?.();
  }

  function sendProgramControl(partial: {
    paused?: boolean;
    t?: number;
  }): void {
    opts.sendJson(
      buildSessionCastMessage({
        op: "state",
        from: opts.localAgentId,
        paused: partial.paused,
        t: partial.t,
        id: streamingFileId ?? remoteProgramFileId ?? undefined,
        name: programName ?? remoteProgramName ?? undefined,
      })
    );
  }

  function applyProgramControl(data: {
    paused?: boolean;
    t?: number;
  }): void {
    if (!program) return;
    if (data.t !== undefined) program.seek?.(data.t);
    if (data.paused === true) program.pause?.();
    if (data.paused === false) program.play?.();
    publishProgramClock(true);
    emit();
  }

  function ingestProgramClock(data: {
    paused?: boolean;
    t?: number;
    duration?: number;
  }): void {
    if (data.paused !== undefined) remoteProgramPaused = data.paused;
    if (data.t !== undefined) remoteProgramTime = data.t;
    if (data.duration !== undefined) remoteProgramDuration = data.duration;
    // replaceTrack often unmutes an existing transceiver track without a
    // fresh `track` event — pull receivers whenever the owner reports clock.
    collectRemoteFromPeers();
    if (
      opts.forward &&
      remoteProgramFrom &&
      remoteProgramFrom !== opts.localAgentId &&
      !program
    ) {
      void thisForwardFrom(remoteProgramFrom);
    }
    opts.onProgramClock?.();
    emit();
  }

  function snap(): RoomMediaState {
    const presenceTracks = [
      isLiveTrack(remotePresenceVideo) ? remotePresenceVideo : null,
      isLiveTrack(remotePresenceAudio) ? remotePresenceAudio : null,
    ].filter((t): t is MediaStreamTrack => Boolean(t));
    // No-signal: hide leftover program receivers so the TV clears locally.
    const programOffered = Boolean(
      programName?.trim() || remoteProgramName?.trim()
    );
    const programTracks = programOffered
      ? [remoteProgramVideo, remoteProgramAudio].filter(
          (t): t is MediaStreamTrack => Boolean(t) && isLiveTrack(t)
        )
      : [];
    const localTracks = [camera].filter((t): t is MediaStreamTrack => Boolean(t));
    const localProgramTracks = [
      program?.video ?? null,
      program?.audio ?? null,
    ].filter((t): t is MediaStreamTrack => isLiveTrack(t));
    presenceCache = streamOf(presenceTracks, presenceCache);
    programCache = streamOf(programTracks, programCache);
    localProgramCache = streamOf(localProgramTracks, localProgramCache);
    localCache = streamOf(localTracks, localCache);
    return {
      camera: liveSource === "camera",
      mic: Boolean(mic),
      display: liveSource === "display",
      programName,
      remoteProgramName,
      remoteProgramKind,
      presenceStream: presenceCache?.stream ?? null,
      programStream: programCache?.stream ?? null,
      localProgramStream: localProgramCache?.stream ?? null,
      localPreviewStream: localCache?.stream ?? null,
      ownerDecodeUrl,
      ownerDecodeKind,
      ...programClockState(),
      error,
      cameraBlocked: false,
      remoteCameraOffered,
      watching,
      remoteMicOffered,
      listening,
      watchingProgram,
      remoteLives: remoteLives.map((l) => ({ ...l })),
      tvSourcePeerId: programFromLive ? tvSourcePeerId : null,
      streamingFileId: programFromLive
        ? null
        : streamingFileId || remoteProgramFileId,
      castingFileId: programFromLive ? null : castingFileId,
      programScope: programFromLive ? null : programScope,
      recordingPeerIds: recordingPeerIds(),
    };
  }

  function emit() {
    const s = snap();
    for (const l of listeners) l(s);
  }

  const boundRemote = new WeakSet<MediaStreamTrack>();
  function holdRemote(
    slot: { layer: "presence" | "program"; kind: "audio" | "video" },
    t: MediaStreamTrack
  ): void {
    if (slot.layer === "presence" && slot.kind === "video") {
      remotePresenceVideo = t;
    } else if (slot.layer === "presence" && slot.kind === "audio") {
      remotePresenceAudio = t;
    } else if (slot.layer === "program" && slot.kind === "audio") {
      remoteProgramAudio = t;
    } else if (slot.layer === "program" && slot.kind === "video") {
      remoteProgramVideo = t;
    }
    if (!boundRemote.has(t) && typeof t.addEventListener === "function") {
      boundRemote.add(t);
      t.addEventListener("unmute", ingestNow);
    }
  }

  function ingestNow() {
    collectRemoteFromPeers();
    if (
      opts.forward &&
      remoteProgramFrom &&
      remoteProgramFrom !== opts.localAgentId &&
      !program &&
      !programFromLive
    ) {
      void thisForwardFrom(remoteProgramFrom);
    }
    emit();
  }

  function collectRemoteFromPeers(): void {
    // Hub remote-file cast: program RTP arrives on the owner's PC. Other
    // guests' program receivers are uplink placeholders — do not overwrite
    // the host TV sink with those (Safari join → Chrome host black).
    const ownLocalProgram = Boolean(program && !programFromLive);
    const programFrom =
      opts.forward &&
      remoteProgramFrom &&
      remoteProgramFrom !== opts.localAgentId &&
      !program &&
      !programFromLive
        ? remoteProgramFrom
        : null;
    if (ownLocalProgram) {
      // Host is sourcing the program — drop leftover guest program receivers
      // so they cannot win roomTvStream over a muted captureStream track.
      remoteProgramVideo = null;
      remoteProgramAudio = null;
    }
    for (const peer of rtpPeers()) {
      const pVid = receiverTrack(peer.pc, "presence", "video");
      const pAud = receiverTrack(peer.pc, "presence", "audio");
      const gVid = receiverTrack(peer.pc, "program", "video");
      const gAud = receiverTrack(peer.pc, "program", "audio");
      if (pVid) holdRemote({ layer: "presence", kind: "video" }, pVid);
      if (pAud) holdRemote({ layer: "presence", kind: "audio" }, pAud);
      const takeProgram =
        ownLocalProgram
          ? false
          : !programFrom || peer.peerId === programFrom;
      if (takeProgram && gVid) {
        holdRemote({ layer: "program", kind: "video" }, gVid);
      }
      if (takeProgram && gAud) {
        holdRemote({ layer: "program", kind: "audio" }, gAud);
      }
    }
  }

  const ingestTimers: ReturnType<typeof setTimeout>[] = [];
  function scheduleIngest() {
    ingestNow();
    for (const ms of [80, 250, 1000, 2500, 5000]) {
      ingestTimers.push(setTimeout(ingestNow, ms));
    }
  }
  function clearIngest() {
    while (ingestTimers.length) {
      const id = ingestTimers.pop();
      if (id) clearTimeout(id);
    }
  }

  function setRemoteLive(
    peerId: string,
    patch: { camera?: boolean; mic?: boolean }
  ): void {
    if (!peerId) return;
    const i = remoteLives.findIndex((l) => l.peerId === peerId);
    const cur =
      i >= 0 ? remoteLives[i]! : { peerId, camera: false, mic: false };
    const next = {
      peerId,
      camera: patch.camera ?? cur.camera,
      mic: patch.mic ?? cur.mic,
    };
    if (!next.camera && !next.mic) {
      remoteLives = remoteLives.filter((l) => l.peerId !== peerId);
    } else if (i >= 0) {
      remoteLives = remoteLives.map((l, j) => (j === i ? next : l));
    } else {
      remoteLives = [...remoteLives, next];
    }
    remoteCameraOffered = remoteLives.some((l) => l.camera);
    remoteMicOffered = remoteLives.some((l) => l.mic);
    if (patch.camera === false && remoteCameraFrom === peerId) {
      remoteCameraFrom = remoteLives.find((l) => l.camera)?.peerId ?? null;
    }
    if (patch.mic === false && remoteMicFrom === peerId) {
      remoteMicFrom = remoteLives.find((l) => l.mic)?.peerId ?? null;
    }
    if (watchingPeerId === peerId && !next.camera && !next.mic) {
      watching = false;
      listening = false;
      watchingPeerId = null;
    }
    if (patch.camera === false && recorder) {
      void recorder.onPeerGone(peerId);
    }
  }

  function markAll(set: Set<string>): number {
    const before = set.size;
    for (const peer of rtpPeers()) {
      if (peer.peerId) set.add(peer.peerId);
    }
    return set.size - before;
  }

  function syncLiveProgram(): void {
    if (!programFromLive || !tvSourcePeerId) return;
    if (
      tvSourcePeerId === "local" ||
      tvSourcePeerId === opts.localAgentId
    ) {
      program = { audio: mic, video: camera, stop() {} };
      return;
    }
    const from = rtpPeers().find((p) => p.peerId === tvSourcePeerId);
    if (!from) return;
    program = {
      audio: receiverTrack(from.pc, "presence", "audio"),
      video: receiverTrack(from.pc, "presence", "video"),
      stop() {},
    };
  }

  function isLiveTvSource(peerId: string): boolean {
    if (!programFromLive || !tvSourcePeerId) return false;
    const local =
      peerId === "local" || peerId === opts.localAgentId;
    if (local) {
      return (
        tvSourcePeerId === "local" || tvSourcePeerId === opts.localAgentId
      );
    }
    return tvSourcePeerId === peerId;
  }

  async function unofferProgram(): Promise<void> {
    if (program || programName || remoteProgramName) {
      opts.sendJson(
        buildSessionCastMessage({
          op: "unoffer",
          from: opts.localAgentId,
        })
      );
    }
    programWatchers.clear();
    if (!programFromLive) program?.stop();
    program = null;
    programFromLive = false;
    tvSourcePeerId = null;
    programName = null;
    remoteProgramName = null;
    remoteProgramKind = null;
    remoteProgramFileId = null;
    remoteProgramFrom = null;
    watchingProgram = false;
    clearRemoteProgramClock();
    streamingFileId = null;
    castingFileId = null;
    programScope = null;
    revokeOwnerDecode();
    await push();
    emit();
  }

  /** Live on the TV went away — clear cast so the room shows 沒訊號. */
  async function clearLiveTvIfSource(peerId: string): Promise<boolean> {
    if (!isLiveTvSource(peerId)) return false;
    await unofferProgram();
    return true;
  }

  function offerProgram(fromPeer?: string): void {
    if (!program && !programName && !remoteProgramName) return;
    const owner =
      fromPeer ??
      (remoteProgramFrom && remoteProgramFrom !== opts.localAgentId
        ? remoteProgramFrom
        : undefined);
    const kind =
      program?.video || remoteProgramKind === "video"
        ? "video"
        : program?.audio || remoteProgramKind === "audio"
          ? "audio"
          : "video";
    opts.sendJson(
      buildSessionCastMessage({
        op: "offer",
        from: opts.localAgentId,
        kind,
        name: programName ?? remoteProgramName ?? "節目",
        id: streamingFileId ?? remoteProgramFileId ?? undefined,
        fromPeer: owner,
        scope: programScope === "private" ? "private" : undefined,
      })
    );
  }

  async function offerRemoteListedProgram(
    id: string,
    owner: string
  ): Promise<RoomMediaResult> {
    const meta = opts.fileMeta?.(id) ?? null;
    const name = meta?.name?.trim() || "節目";
    const kind = meta?.kind ?? "video";
    if (!programFromLive) program?.stop();
    program = null;
    programFromLive = false;
    tvSourcePeerId = null;
    streamingFileId = id;
    programName = name;
    remoteProgramName = name;
    remoteProgramKind = kind;
    remoteProgramFileId = id;
    remoteProgramFrom = owner;
    watchingProgram = true;
    clearRemoteProgramClock();
    remoteProgramPaused = false;
    error = null;
    revokeOwnerDecode();
    markAll(programWatchers);
    opts.sendJson(
      buildSessionCastMessage({
        op: "offer",
        from: opts.localAgentId,
        kind,
        name,
        id,
        fromPeer: owner,
      })
    );
    // 2+2 placeholders unmute in place — bind receivers now and poll briefly.
    collectRemoteFromPeers();
    scheduleIngest();
    await thisForwardFrom(owner);
    collectRemoteFromPeers();
    emit();
    return { ok: true };
  }

  async function thisForwardFrom(fromPeerId: string): Promise<void> {
    if (!opts.forward) return;
    const peers = rtpPeers();
    const from = peers.find((p) => p.peerId === fromPeerId);
    if (!from) return;
    for (const dest of peers) {
      if (dest.peerId === fromPeerId) continue;
      if (!camera && cameraWatchers.has(dest.peerId)) {
        const video = receiverTrack(from.pc, "presence", "video");
        if (video) {
          await replaceBoothTrack(dest.pc, "presence", "video", video);
        }
      }
      if (programFromLive && programWatchers.has(dest.peerId)) {
        const audio =
          program?.audio ?? receiverTrack(from.pc, "presence", "audio");
        const video =
          program?.video ?? receiverTrack(from.pc, "presence", "video");
        if (audio) await replaceBoothTrack(dest.pc, "program", "audio", audio);
        if (video) await replaceBoothTrack(dest.pc, "program", "video", video);
        continue;
      }
      if (program) continue;
      if (!programWatchers.has(dest.peerId)) continue;
      const audio = receiverTrack(from.pc, "program", "audio");
      const video = receiverTrack(from.pc, "program", "video");
      // Clone so the host TV can keep the original receiver track while Hub
      // fans the same program out to multiple guests.
      const sendAudio = cloneTrackForForward(audio);
      const sendVideo = cloneTrackForForward(video);
      if (sendAudio) await replaceBoothTrack(dest.pc, "program", "audio", sendAudio);
      if (sendVideo) await replaceBoothTrack(dest.pc, "program", "video", sendVideo);
    }
    // Presence audio is always hub-mixed (§9.8.1), not single-track forward.
    await pushPresenceAudio();
  }

  async function becomeListedProgramSource(
    id: string,
    nameHint?: string
  ): Promise<RoomMediaResult> {
    const out = await ensureCaptured(id);
    if (!out.ok) {
      opts.sendJson(
        buildSessionCastMessage({
          op: "reject",
          from: opts.localAgentId,
          id,
          reason: out.error || goRoomCastCaptureError(),
        })
      );
      return out;
    }
    remoteProgramName = null;
    remoteProgramKind = null;
    remoteProgramFileId = null;
    remoteProgramFrom = null;
    watchingProgram = false;
    if (nameHint?.trim()) programName = nameHint.trim();
    programScope = "share";
    markAll(programWatchers);
    await push();
    publishProgramClock();
    emit();
    return { ok: true };
  }

  async function push(): Promise<void> {
    const hubRemoteProgram =
      Boolean(opts.forward) &&
      Boolean(remoteProgramFrom) &&
      remoteProgramFrom !== opts.localAgentId &&
      !program &&
      !programFromLive;
    await pushPresenceAudio();
    for (const peer of rtpPeers()) {
      if (!peer.peerId) continue;
      const presenceVideo =
        camera && cameraWatchers.has(peer.peerId) ? camera : null;
      const sendProgram = Boolean(program && programWatchers.has(peer.peerId));
      await replaceBoothTrack(peer.pc, "presence", "video", presenceVideo);
      // Remote file cast: program RTP is Hub-forwarded from owner. Do not
      // null the program senders here — that undoes forwardFrom for joiners.
      if (hubRemoteProgram) continue;
      await replaceBoothTrack(
        peer.pc,
        "program",
        "audio",
        sendProgram ? (program?.audio ?? null) : null
      );
      await replaceBoothTrack(
        peer.pc,
        "program",
        "video",
        sendProgram ? (program?.video ?? null) : null
      );
    }
    if (hubRemoteProgram && remoteProgramFrom) {
      await thisForwardFrom(remoteProgramFrom);
    }
  }

  async function stopTrack(t: MediaStreamTrack | null): Promise<void> {
    try {
      t?.stop();
    } catch {
      /* ignore */
    }
  }

  let ownerDecodeUrl: string | null = null;
  let ownerDecodeKind: "audio" | "video" | null = null;
  let ownerDecodeEl: HTMLMediaElement | null = null;

  function bindProgramClock(next: CapturedProgram | null): void {
    const el = next?.mediaEl;
    if (!el) return;
    const onTick = () => {
      publishProgramClock();
      emit();
    };
    el.addEventListener("timeupdate", onTick);
    el.addEventListener("play", onTick);
    el.addEventListener("pause", onTick);
    el.addEventListener("seeked", onTick);
  }

  function revokeOwnerDecode(): void {
    if (ownerDecodeUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(ownerDecodeUrl);
      } catch {
        /* ignore */
      }
    }
    ownerDecodeUrl = null;
    ownerDecodeKind = null;
    ownerDecodeEl = null;
  }

  async function captureLocalFile(
    file: File,
    quiet = false,
    fileId?: string,
    via: "http" | "blob" = localFileProgramCaptureMode(fileId)
  ): Promise<RoomMediaResult> {
    if (via === "http" && fileId) {
      const registered = await ensureLocalRoomFile(fileId, file);
      if (!registered) {
        if (!quiet) {
          error = GO_ROOM_FILE_SW_REQUIRED;
          emit();
        }
        return { ok: false, error: GO_ROOM_FILE_SW_REQUIRED };
      }
    }
    const capture =
      opts.captureProgram ??
      ((f: File) =>
        via === "http" && fileId
          ? captureProgramFromHttp(roomFilePath(fileId, { purpose: "play" }), f)
          : captureProgramFromBlob(f));
    const next = await capture(file);
    const castErr =
      programCaptureKindOfFile(file) === "image"
        ? GO_ROOM_CAST_UNSUPPORTED
        : goRoomCastCaptureError();
    if (!next || (!next.audio && !next.video)) {
      if (!quiet) {
        error = castErr;
        emit();
      }
      return { ok: false, error: castErr };
    }
    program?.stop();
    program = next;
    programFromLive = false;
    tvSourcePeerId = null;
    // Drop guest program receivers before emit — otherwise an unmuted
    // placeholder can win the TV over a still-muted local capture track.
    remoteProgramVideo = null;
    remoteProgramAudio = null;
    programName = file.name.trim() || "影片";
    remoteProgramName = null;
    remoteProgramKind = null;
    ownerDecodeKind = programKindOfFile(file);
    error = null;
    bindProgramClock(next);
    return { ok: true };
  }

  function tryCaptureOwner(): RoomMediaResult {
    if (program && (program.audio || program.video)) return { ok: true };
    if (!ownerDecodeEl) {
      return { ok: false, error: goRoomCastCaptureError() };
    }
    const next = captureFromMediaElement(ownerDecodeEl);
    if (!next || (!next.audio && !next.video)) {
      return { ok: false, error: goRoomCastCaptureError() };
    }
    program?.stop();
    program = next;
    error = null;
    bindProgramClock(next);
    return { ok: true };
  }

  async function ensureCaptured(
    id: string,
    quiet = false
  ): Promise<RoomMediaResult> {
    if (streamingFileId === id && program && (program.audio || program.video)) {
      return { ok: true };
    }
    if (streamingFileId === id && ownerDecodeUrl) {
      const started = Date.now();
      while (Date.now() - started < 8000) {
        const out = tryCaptureOwner();
        if (out.ok) return out;
        await new Promise((r) => setTimeout(r, 40));
      }
      const late = tryCaptureOwner();
      if (late.ok) return late;
    }
    const file = opts.resolveLocalFile?.(id) ?? null;
    if (!file) {
      if (!quiet) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
      }
      return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
    }
    const out = await captureLocalFile(file, quiet, id);
    if (out.ok) streamingFileId = id;
    return out;
  }

  async function dropCamera(): Promise<void> {
    await stopTrack(camera);
    camera = null;
  }

  async function unofferLiveVideo(): Promise<void> {
    if (liveSource) {
      opts.sendJson(
        buildSessionCameraMessage({
          op: "unoffer",
          from: opts.localAgentId,
        })
      );
    }
    cameraWatchers.clear();
    await dropCamera();
    liveSource = null;
    if (await clearLiveTvIfSource("local")) return;
    await push();
    emit();
  }

  return {
    async enableCamera() {
      try {
        const stream = await getUserMedia({ video: true, audio: false });
        const switching = liveSource != null;
        await dropCamera();
        camera = stream.getVideoTracks()[0] ?? null;
        if (!camera) {
          liveSource = null;
          error = GO_ROOM_MEDIA_PERM_DENIED;
          emit();
          return { ok: false, error: GO_ROOM_MEDIA_PERM_DENIED };
        }
        liveSource = "camera";
        error = null;
        if (!switching) {
          opts.sendJson(
            buildSessionCameraMessage({
              op: "offer",
              from: opts.localAgentId,
            })
          );
        }
        await push();
        emit();
        return { ok: true };
      } catch {
        error = GO_ROOM_MEDIA_PERM_DENIED;
        emit();
        return { ok: false, error: GO_ROOM_MEDIA_PERM_DENIED };
      }
    },
    async disableCamera() {
      if (liveSource !== "camera") return;
      await unofferLiveVideo();
    },
    async enableDisplay() {
      try {
        const stream = await getDisplayMedia({ video: true, audio: false });
        const switching = liveSource != null;
        await dropCamera();
        camera = stream.getVideoTracks()[0] ?? null;
        if (!camera) {
          liveSource = null;
          error = GO_ROOM_DISPLAY_PERM_DENIED;
          emit();
          return { ok: false, error: GO_ROOM_DISPLAY_PERM_DENIED };
        }
        liveSource = "display";
        error = null;
        if (typeof camera.addEventListener === "function") {
          camera.addEventListener("ended", () => {
            if (liveSource === "display") void unofferLiveVideo();
          });
        }
        if (!switching) {
          opts.sendJson(
            buildSessionCameraMessage({
              op: "offer",
              from: opts.localAgentId,
            })
          );
        }
        await push();
        emit();
        return { ok: true };
      } catch {
        error = GO_ROOM_DISPLAY_PERM_DENIED;
        emit();
        return { ok: false, error: GO_ROOM_DISPLAY_PERM_DENIED };
      }
    },
    async disableDisplay() {
      if (liveSource !== "display") return;
      await unofferLiveVideo();
    },
    async enableMic() {
      try {
        const stream = await getUserMedia({ audio: true, video: false });
        await stopTrack(mic);
        mic = stream.getAudioTracks()[0] ?? null;
        if (!mic) {
          error = GO_ROOM_MEDIA_PERM_DENIED;
          emit();
          return { ok: false, error: GO_ROOM_MEDIA_PERM_DENIED };
        }
        error = null;
        opts.sendJson(
          buildSessionMicMessage({
            op: "offer",
            from: opts.localAgentId,
          })
        );
        markAll(micListeners);
        await push();
        emit();
        return { ok: true };
      } catch {
        error = GO_ROOM_MEDIA_PERM_DENIED;
        emit();
        return { ok: false, error: GO_ROOM_MEDIA_PERM_DENIED };
      }
    },
    async disableMic() {
      if (mic) {
        opts.sendJson(
          buildSessionMicMessage({
            op: "unoffer",
            from: opts.localAgentId,
          })
        );
      }
      micListeners.clear();
      await stopTrack(mic);
      mic = null;
      if (isLiveTvSource("local") && !camera) {
        await unofferProgram();
        return;
      }
      if (isLiveTvSource("local")) syncLiveProgram();
      await push();
      emit();
    },
    async startProgram(file) {
      const out = await captureLocalFile(file);
      if (!out.ok) return out;
      streamingFileId = null;
      programScope = null;
      markAll(programWatchers);
      offerProgram();
      await push();
      emit();
      return { ok: true };
    },
    async startListedProgram(id) {
      const local = opts.resolveLocalFile?.(id) ?? null;
      if (local) {
        castingFileId = id;
        emit();
        try {
          const out = await ensureCaptured(id);
          if (!out.ok) return out;
          programScope = "share";
          markAll(programWatchers);
          offerProgram();
          await push();
          emit();
          return { ok: true };
        } finally {
          castingFileId = null;
          emit();
        }
      }
      const owner = opts.ownerOf?.(id)?.trim() || "";
      if (!owner || owner === opts.localAgentId) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
        return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
      }
      castingFileId = id;
      emit();
      try {
        const remote = await offerRemoteListedProgram(id, owner);
        if (remote.ok) programScope = "share";
        return remote;
      } finally {
        castingFileId = null;
        emit();
      }
    },
    async startPrivateProgram(id) {
      const file = (await opts.resolvePrivateFile?.(id)) ?? null;
      if (!file) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
        return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
      }
      castingFileId = id;
      emit();
      try {
        const out = await captureLocalFile(file, false, id, "blob");
        if (!out.ok) return out;
        streamingFileId = id;
        programScope = "private";
        markAll(programWatchers);
        offerProgram();
        await push();
        emit();
        return { ok: true };
      } finally {
        castingFileId = null;
        emit();
      }
    },
    pauseProgram() {
      if (program?.pause) {
        program.pause();
        publishProgramClock(true);
        emit();
        return;
      }
      if (streamingFileId && remoteProgramFrom) {
        remoteProgramPaused = true;
        sendProgramControl({ paused: true, t: remoteProgramTime });
        emit();
      }
    },
    playProgram() {
      if (program?.play) {
        program.play();
        publishProgramClock(true);
        emit();
        return;
      }
      if (streamingFileId && remoteProgramFrom) {
        remoteProgramPaused = false;
        sendProgramControl({ paused: false, t: remoteProgramTime });
        emit();
      }
    },
    seekProgram(seconds) {
      if (program?.seek) {
        program.seek(seconds);
        publishProgramClock(true);
        emit();
        return;
      }
      if (streamingFileId && remoteProgramFrom && Number.isFinite(seconds)) {
        remoteProgramTime = Math.max(0, seconds);
        sendProgramControl({ t: remoteProgramTime, paused: remoteProgramPaused });
        emit();
      }
    },
    async stopProgram() {
      await unofferProgram();
    },
    async putLiveOnTv(peerId, name) {
      const local =
        !peerId ||
        peerId === "local" ||
        peerId === opts.localAgentId;
      if (local) {
        if (!camera && !mic) {
          return { ok: false, error: "先開鏡頭或麥克風" };
        }
        if (!programFromLive) program?.stop();
        tvSourcePeerId = "local";
        programFromLive = true;
        program = {
          audio: mic,
          video: camera,
          stop() {},
        };
      } else {
        const from = rtpPeers().find((p) => p.peerId === peerId);
        if (!from) return { ok: false, error: "這個人不在" };
        if (!programFromLive) program?.stop();
        tvSourcePeerId = peerId;
        programFromLive = true;
        opts.sendJson(
          buildSessionCameraMessage({
            op: "request",
            from: opts.localAgentId,
          })
        );
        syncLiveProgram();
      }
      programName = name?.trim() || "鏡頭";
      remoteProgramName = null;
      remoteProgramKind = null;
      streamingFileId = null;
      programScope = null;
      error = null;
      markAll(programWatchers);
      offerProgram();
      await push();
      if (!local) await this.forwardFrom(peerId);
      emit();
      return { ok: true };
    },
    async startRecording(peerId, displayName, label) {
      if (!recorder) {
        return { ok: false, error: "這台無法錄影" };
      }
      const out = await recorder.start(
        peerId,
        displayName?.trim() || "鏡頭",
        label
      );
      emit();
      return out.ok ? { ok: true } : { ok: false, error: out.error };
    },
    async stopRecording(peerId) {
      if (!recorder) return { ok: true };
      const out = await recorder.stop(peerId);
      emit();
      return out.ok ? { ok: true } : { ok: false, error: out.error };
    },
    async haltLive(peerId, layer) {
      const local =
        !peerId ||
        peerId === "local" ||
        peerId === opts.localAgentId;
      if (local) {
        if (layer === "audio") await this.disableMic();
        else {
          await this.disableCamera();
          await this.disableDisplay();
        }
        return { ok: true };
      }
      opts.sendJson(
        buildSessionBoothMessage({
          op: layer === "audio" ? "mute" : "camera_off",
          from: opts.localAgentId,
          to: peerId,
        })
      );
      setRemoteLive(
        peerId,
        layer === "audio" ? { mic: false } : { camera: false }
      );
      if (layer !== "audio") {
        if (await clearLiveTvIfSource(peerId)) return { ok: true };
      } else if (isLiveTvSource(peerId)) {
        syncLiveProgram();
        if (!program?.video && !program?.audio) {
          await unofferProgram();
          return { ok: true };
        }
        await push();
      }
      emit();
      return { ok: true };
    },
    async warmProgram(id) {
      const file = opts.resolveLocalFile?.(id) ?? null;
      if (!file) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
        return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
      }
      if (streamingFileId === id && ownerDecodeUrl) {
        emit();
        return { ok: true };
      }
      program?.stop();
      program = null;
      revokeOwnerDecode();
      ownerDecodeUrl = roomFilePath(id, { purpose: "play" });
      ownerDecodeKind = programKindOfFile(file);
      streamingFileId = id;
      programName = file.name.trim() || "影片";
      remoteProgramName = null;
      remoteProgramKind = null;
      error = null;
      emit();
      return { ok: true };
    },
    async captureFromElement(el) {
      ownerDecodeEl = el;
      const out = tryCaptureOwner();
      emit();
      return out;
    },
    async stopStreamingFile(id) {
      if (streamingFileId !== id) return;
      await this.stopProgram();
    },
    async watchCamera() {
      watching = true;
      watchingPeerId =
        watchingPeerId ??
        remoteCameraFrom ??
        remoteLives.find((l) => l.camera)?.peerId ??
        null;
      error = null;
      collectRemoteFromPeers();
      opts.sendJson(
        buildSessionCameraMessage({
          op: "request",
          from: opts.localAgentId,
        })
      );
      emit();
      scheduleIngest();
      return { ok: true };
    },
    async watchLive(peerId) {
      const live = remoteLives.find((l) => l.peerId === peerId);
      if (!live || (!live.camera && !live.mic)) {
        return { ok: false, error: "對方沒有開鏡頭" };
      }
      watchingPeerId = peerId;
      error = null;
      if (live.camera) await this.watchCamera();
      if (live.mic) await this.listenMic();
      emit();
      return { ok: true };
    },
    async stopWatching() {
      if (watching) {
        opts.sendJson(
          buildSessionCameraMessage({
            op: "release",
            from: opts.localAgentId,
          })
        );
      }
      watching = false;
      watchingPeerId = null;
      emit();
    },
    async listenMic() {
      listening = true;
      watchingPeerId =
        watchingPeerId ??
        remoteMicFrom ??
        remoteLives.find((l) => l.mic)?.peerId ??
        null;
      error = null;
      collectRemoteFromPeers();
      opts.sendJson(
        buildSessionMicMessage({
          op: "request",
          from: opts.localAgentId,
        })
      );
      emit();
      scheduleIngest();
      return { ok: true };
    },
    async stopListening() {
      if (listening) {
        opts.sendJson(
          buildSessionMicMessage({
            op: "release",
            from: opts.localAgentId,
          })
        );
      }
      listening = false;
      emit();
    },
    async watchProgram(id?: string) {
      if (id) {
        return { ok: false, error: "影音檔請用播放，不走 live stream" };
      }
      watchingProgram = true;
      error = null;
      collectRemoteFromPeers();
      opts.sendJson(
        buildSessionCastMessage({
          op: "request",
          from: opts.localAgentId,
        })
      );
      emit();
      scheduleIngest();
      return { ok: true };
    },
    async stopWatchingProgram() {
      if (watchingProgram) {
        opts.sendJson(
          buildSessionCastMessage({
            op: "release",
            from: opts.localAgentId,
          })
        );
      }
      watchingProgram = false;
      clearIngest();
      emit();
    },
    async refresh() {
      collectRemoteFromPeers();
      if (programFromLive) syncLiveProgram();
      if (program) {
        const added = markAll(programWatchers);
        if (added > 0) offerProgram();
      } else if (
        opts.forward &&
        remoteProgramFrom &&
        remoteProgramFrom !== opts.localAgentId
      ) {
        // Late joiners need a fresh session_cast offer (RTP forward alone is
        // not enough for 沒訊號／大螢幕播放中).
        const added = markAll(programWatchers);
        if (added > 0) offerProgram(remoteProgramFrom);
        await thisForwardFrom(remoteProgramFrom);
      }
      if (mic) markAll(micListeners);
      await push();
      emit();
    },
    async forwardFrom(fromPeerId) {
      await thisForwardFrom(fromPeerId);
    },
    async onControl(data) {
      if (isSessionRecordMessage(data)) {
        if (opts.forward) return;
        if (data.op === "notify" && data.targetPeer) {
          const next = applyRecordNotify(recordingNotified, data);
          recordingNotified.clear();
          for (const id of next) recordingNotified.add(id);
          emit();
        }
        return;
      }
      if (isSessionBoothMessage(data)) {
        if (opts.forward) return;
        if (data.to !== opts.localAgentId) return;
        if (data.op === "mute") await this.disableMic();
        if (data.op === "camera_off") {
          await this.disableCamera();
          await this.disableDisplay();
        }
        return;
      }
      if (isSessionCameraMessage(data)) {
        if (data.from === opts.localAgentId) return;
        if (data.op === "offer") {
          setRemoteLive(data.from, { camera: true });
          remoteCameraFrom = data.from;
          emit();
          return;
        }
        if (data.op === "unoffer") {
          setRemoteLive(data.from, { camera: false });
          if (watchingPeerId === data.from) watching = false;
          if (await clearLiveTvIfSource(data.from)) return;
          emit();
          return;
        }
        if (data.op === "request") {
          cameraWatchers.add(data.from);
          if (camera) await push();
          else if (opts.forward && remoteCameraFrom && remoteCameraFrom !== data.from) {
            await this.forwardFrom(remoteCameraFrom);
          }
          emit();
          return;
        }
        if (data.op === "release") {
          cameraWatchers.delete(data.from);
          await push();
          emit();
        }
        return;
      }
      if (isSessionMicMessage(data)) {
        if (data.from === opts.localAgentId) return;
        if (data.op === "offer") {
          setRemoteLive(data.from, { mic: true });
          remoteMicFrom = data.from;
          emit();
          if (!listening) void this.listenMic();
          if (opts.forward) {
            markAll(micListeners);
            await this.forwardFrom(data.from);
          }
          return;
        }
        if (data.op === "unoffer") {
          setRemoteLive(data.from, { mic: false });
          if (watchingPeerId === data.from) listening = false;
          if (isLiveTvSource(data.from)) {
            syncLiveProgram();
            if (!program?.video && !program?.audio) {
              await unofferProgram();
              return;
            }
            await push();
            emit();
            return;
          }
          if (opts.forward) {
            await pushPresenceAudio();
          }
          emit();
          return;
        }
        if (data.op === "request") {
          if (!mic && !opts.forward) return;
          micListeners.add(data.from);
          if (mic || opts.forward) await pushPresenceAudio();
          emit();
          return;
        }
        if (data.op === "release") {
          micListeners.delete(data.from);
          await push();
          emit();
        }
        return;
      }
      if (!isSessionCastMessage(data)) return;
      if (data.from === opts.localAgentId) return;
      if (data.op === "offer") {
        const fileId = data.id?.trim() || "";
        const fromPeer = data.fromPeer?.trim() || "";
        const privateOffer = data.scope === "private";
        const iAmSource =
          !privateOffer &&
          Boolean(fileId) &&
          (fromPeer === opts.localAgentId ||
            (!fromPeer && Boolean(opts.resolveLocalFile?.(fileId)))) &&
          Boolean(opts.resolveLocalFile?.(fileId));
        if (iAmSource && fileId) {
          await becomeListedProgramSource(fileId, data.name);
          return;
        }
        if (!privateOffer && fromPeer === opts.localAgentId && fileId) {
          opts.sendJson(
            buildSessionCastMessage({
              op: "reject",
              from: opts.localAgentId,
              id: fileId,
              reason: GO_ROOM_CAST_UNSUPPORTED,
            })
          );
          return;
        }
        remoteProgramName = data.name?.trim() || "節目";
        remoteProgramKind = data.kind ?? "video";
        remoteProgramFileId = fileId || null;
        remoteProgramFrom = fromPeer || data.from;
        if (privateOffer) programScope = "private";
        else if (fileId) programScope = "share";
        emit();
        if (!watchingProgram) void this.watchProgram();
        if (opts.forward) {
          markAll(programWatchers);
          await thisForwardFrom(remoteProgramFrom);
        }
        return;
      }
      if (data.op === "unoffer") {
        if (program && streamingFileId && !programFromLive) {
          program.stop();
          program = null;
          streamingFileId = null;
          programScope = null;
          programName = null;
          revokeOwnerDecode();
          await push();
        }
        remoteProgramName = null;
        remoteProgramKind = null;
        remoteProgramFileId = null;
        remoteProgramFrom = null;
        watchingProgram = false;
        remoteProgramVideo = null;
        remoteProgramAudio = null;
        programCache = null;
        clearRemoteProgramClock();
        emit();
        return;
      }
      if (data.op === "request") {
        if (data.id) {
          return;
        }
        programWatchers.add(data.from);
        const peers = rtpPeers().filter((p) => p.peerId);
        if (!peers.some((p) => p.peerId === data.from)) {
          for (const p of peers) programWatchers.add(p.peerId);
        }
        if (program) await push();
        const owner = remoteProgramFrom;
        if (opts.forward && owner && owner !== opts.localAgentId) {
          await thisForwardFrom(owner);
        }
        emit();
        return;
      }
      if (data.op === "reject") {
        const reason =
          typeof data.reason === "string" && data.reason.trim()
            ? data.reason.trim()
            : GO_ROOM_CAST_UNSUPPORTED;
        const mine =
          Boolean(data.id) &&
          (streamingFileId === data.id ||
            remoteProgramFileId === data.id ||
            watchingProgram);
        if (!mine) return;
        if (
          opts.forward &&
          remoteProgramFileId === data.id &&
          remoteProgramFrom &&
          remoteProgramFrom !== opts.localAgentId
        ) {
          error = reason;
          await unofferProgram();
          error = reason;
          emit();
          return;
        }
        watchingProgram = false;
        if (streamingFileId === data.id || remoteProgramFileId === data.id) {
          streamingFileId = null;
          programScope = null;
          programName = null;
          remoteProgramName = null;
          remoteProgramKind = null;
          remoteProgramFileId = null;
          remoteProgramFrom = null;
        }
        error = reason;
        emit();
        return;
      }
      if (data.op === "state") {
        if (program && data.from !== opts.localAgentId) {
          applyProgramControl({
            paused: data.paused,
            t: data.t,
          });
          return;
        }
        if (!program && data.from !== opts.localAgentId) {
          ingestProgramClock({
            paused: data.paused,
            t: data.t,
            duration: data.duration,
          });
          return;
        }
        if (watchingProgram) scheduleIngest();
        return;
      }
      if (data.op === "release") {
        programWatchers.delete(data.from);
        await push();
        emit();
      }
    },
    onRemoteTrack(ev, pc) {
      const list = pc.getTransceivers();
      let index = -1;
      if (ev.transceiver) {
        index = list.indexOf(ev.transceiver as (typeof list)[number]);
      }
      if (index < 0) {
        index = list.findIndex(
          (t) =>
            (t as { receiver?: { track?: MediaStreamTrack } }).receiver
              ?.track === ev.track
        );
      }
      const slot = boothSlotOfIndex(index);
      if (!slot) return;
      holdRemote(slot, ev.track);
      if (programFromLive) {
        syncLiveProgram();
        void push();
      } else if (
        opts.forward &&
        remoteProgramFrom &&
        remoteProgramFrom !== opts.localAgentId &&
        !program
      ) {
        void thisForwardFrom(remoteProgramFrom);
      }
      emit();
    },
    getState: snap,
    subscribe(listener) {
      listeners.add(listener);
      listener(snap());
      return () => listeners.delete(listener);
    },
    dispose() {
      recorder?.dispose();
      recordingNotified.clear();
      liveSource = null;
      void dropCamera();
      void stopTrack(mic);
      mic = null;
      program?.stop();
      program = null;
      programName = null;
      streamingFileId = null;
      castingFileId = null;
      programScope = null;
      revokeOwnerDecode();
      clearIngest();
      presenceMixer?.close();
      listeners.clear();
    },
  };
}

function streamOf(
  tracks: MediaStreamTrack[],
  cache: { ids: string; stream: MediaStream } | null
): { ids: string; stream: MediaStream } | null {
  if (!tracks.length || typeof MediaStream !== "function") return null;
  const ids = tracks.map((t) => t.id).join("\0");
  if (cache && cache.ids === ids) return cache;
  try {
    return { ids, stream: new MediaStream(tracks) };
  } catch {
    return null;
  }
}

function mediaElementCaptureStream(el: HTMLMediaElement): MediaStream | null {
  const anyEl = el as HTMLMediaElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
  };
  const fn = anyEl.captureStream ?? anyEl.mozCaptureStream;
  if (typeof fn !== "function") return null;
  try {
    return fn.call(el);
  } catch {
    try {
      return fn.call(el, 30);
    } catch {
      return null;
    }
  }
}

function programKindOfFile(file: File): "audio" | "video" {
  return programCaptureKindOfFile(file) === "audio" ? "audio" : "video";
}

/** Decode path for local program capture (image → canvas; A/V → media element). */
export function programCaptureKindOfFile(
  file: File
): "audio" | "video" | "image" {
  const mime = (file.type || "").toLowerCase();
  const name = file.name || "";
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(name)) {
    return "image";
  }
  if (
    (mime.startsWith("audio/") && !mime.startsWith("video/")) ||
    /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(name)
  ) {
    return "audio";
  }
  return "video";
}

/**
 * Share-catalog file ids must decode via `/room-file` (SW) — plan §8.2.
 * Private／ad-hoc File (no catalog id) may use blob: for capture only.
 */
export function localFileProgramCaptureMode(fileId?: string): "blob" | "http" {
  return fileId ? "http" : "blob";
}

function captureFromMediaElement(el: HTMLMediaElement): CapturedProgram | null {
  if (typeof el.play === "function") {
    try {
      const played = el.play();
      if (played && typeof played.catch === "function") void played.catch(() => {});
    } catch {
      /* ignore */
    }
  }
  let raf = 0;
  let drawTimer = 0;
  let stream = mediaElementCaptureStream(el);
  const video = el as HTMLVideoElement;
  const nativeOk = htmlMediaCaptureStreamSupported();
  const canCanvas =
    allowCanvasProgramCaptureFallback({
      nativeHtmlMediaCaptureStream: nativeOk,
    }) &&
    typeof document !== "undefined" &&
    typeof document.createElement("canvas").captureStream === "function";
  if (
    (!stream || !stream.getVideoTracks()[0]) &&
    canCanvas &&
    "videoWidth" in video
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, video.videoWidth || 640);
    canvas.height = Math.max(2, video.videoHeight || 360);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const draw = () => {
        if (video.ended) return;
        if (video.videoWidth >= 2) {
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        if (typeof window !== "undefined" && window.requestAnimationFrame) {
          raf = window.requestAnimationFrame(draw);
        }
      };
      draw();
      if (typeof window !== "undefined") {
        drawTimer = window.setInterval(draw, 33);
      }
      const fromCanvas = canvas.captureStream(30);
      if (stream) {
        const audio = stream.getAudioTracks()[0];
        if (audio && !fromCanvas.getAudioTracks()[0]) fromCanvas.addTrack(audio);
        stream = fromCanvas;
      } else {
        stream = fromCanvas;
        const fromEl = mediaElementCaptureStream(el);
        const audio = fromEl?.getAudioTracks()[0];
        if (audio) stream.addTrack(audio);
      }
    }
  }
  if (!stream || (!stream.getVideoTracks()[0] && !stream.getAudioTracks()[0])) {
    if (raf && typeof window !== "undefined") window.cancelAnimationFrame(raf);
    if (drawTimer && typeof window !== "undefined") window.clearInterval(drawTimer);
    return null;
  }
  for (const t of stream.getTracks()) t.enabled = true;
  const captured = stream;
  const videoTrack = captured.getVideoTracks()[0] ?? null;
  if (videoTrack) {
    try {
      videoTrack.contentHint = "motion";
    } catch {
      /* ignore */
    }
  }
  return {
    audio: captured.getAudioTracks()[0] ?? null,
    video: videoTrack,
    ...transportFromElement(el),
    stop() {
      if (raf && typeof window !== "undefined") window.cancelAnimationFrame(raf);
      if (drawTimer && typeof window !== "undefined") window.clearInterval(drawTimer);
      for (const t of captured.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

async function captureProgramFromBlob(
  file: File
): Promise<CapturedProgram | null> {
  if (
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return null;
  }
  const url = URL.createObjectURL(file);
  const captured = await captureProgramFromHttp(url, file);
  if (!captured) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
    return null;
  }
  const innerStop = captured.stop.bind(captured);
  return {
    ...captured,
    stop() {
      innerStop();
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Static image → canvas.captureStream (plan §5.7). Primary path — not a WebKit media fallback. */
const IMAGE_PROGRAM_FPS = 5;

async function captureProgramFromImage(
  src: string
): Promise<CapturedProgram | null> {
  if (typeof document === "undefined") return null;
  if (typeof HTMLCanvasElement === "undefined") return null;
  const canCapture =
    typeof document.createElement("canvas").captureStream === "function";
  if (!canCapture) return null;

  const img = new Image();
  img.decoding = "async";
  const loaded = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
  if (!loaded || img.naturalWidth < 1 || img.naturalHeight < 1) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, img.naturalWidth);
  canvas.height = Math.max(2, img.naturalHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const draw = () => {
    try {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } catch {
      /* ignore */
    }
  };
  draw();

  let stream: MediaStream;
  try {
    stream = canvas.captureStream(IMAGE_PROGRAM_FPS);
  } catch {
    return null;
  }
  const videoTrack = stream.getVideoTracks()[0] ?? null;
  if (!videoTrack) {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    return null;
  }
  try {
    videoTrack.contentHint = "detail";
  } catch {
    /* ignore */
  }
  videoTrack.enabled = true;

  const drawMs = Math.max(50, Math.round(1000 / IMAGE_PROGRAM_FPS));
  const drawTimer =
    typeof window !== "undefined" ? window.setInterval(draw, drawMs) : 0;

  return {
    audio: null,
    video: videoTrack,
    stop() {
      if (drawTimer && typeof window !== "undefined") {
        window.clearInterval(drawTimer);
      }
      try {
        img.removeAttribute("src");
      } catch {
        /* ignore */
      }
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

async function waitForProgramMediaReady(
  el: HTMLMediaElement,
  isAudio: boolean,
  ms = 12_000
): Promise<boolean> {
  const video = el as HTMLVideoElement;
  const deadline = Date.now() + ms;
  const tryPlay = () => {
    void el.play().catch(() => {
      /* Background tabs often reject play(); keep retrying until ready. */
    });
  };
  tryPlay();
  while (Date.now() < deadline) {
    if (isAudio) {
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true;
    } else if (video.videoWidth >= 2 && video.videoHeight >= 2) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 40));
    tryPlay();
  }
  if (isAudio) return el.readyState >= HTMLMediaElement.HAVE_METADATA;
  return video.videoWidth >= 2 && video.videoHeight >= 2;
}

async function captureProgramFromHttp(
  src: string,
  file: File
): Promise<CapturedProgram | null> {
  if (typeof document === "undefined") return null;
  if (programCaptureKindOfFile(file) === "image") {
    return captureProgramFromImage(src);
  }
  const mime = file.type || "";
  const isAudio = mime.startsWith("audio/") && !mime.startsWith("video/");
  const el = document.createElement(isAudio ? "audio" : "video") as
    | HTMLVideoElement
    | HTMLAudioElement;
  el.muted = true;
  el.defaultMuted = true;
  el.volume = 0;
  el.autoplay = true;
  el.loop = true;
  el.preload = "auto";
  el.controls = false;
  el.setAttribute("muted", "");
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  /**
   * Keep a real on-screen box: opacity 0 / off-screen often skips decode.
   * Edge was especially picky — tiny＋near-invisible → black captureStream.
   */
  el.style.cssText =
    "position:fixed;left:0;bottom:0;width:160px;height:90px;opacity:0.08;pointer-events:none;z-index:0;border:0;";
  if ("playsInline" in el) {
    (el as HTMLVideoElement).playsInline = true;
  }
  document.body.appendChild(el);
  el.src = src;

  const failCleanup = () => {
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    } catch {
      /* ignore */
    }
  };

  let sawError = false;
  el.addEventListener(
    "error",
    () => {
      sawError = true;
    },
    { once: true }
  );

  const ready = await waitForProgramMediaReady(el, isAudio);
  if (sawError || !ready) {
    failCleanup();
    return null;
  }

  const onVisible = () => {
    if (!document.hidden) {
      void el.play().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  let raf = 0;
  let drawTimer = 0;
  let stream = mediaElementCaptureStream(el);
  const video = el as HTMLVideoElement;
  const nativeOk = htmlMediaCaptureStreamSupported();
  if (
    !isAudio &&
    (!stream || !stream.getVideoTracks()[0]) &&
    allowCanvasProgramCaptureFallback({
      nativeHtmlMediaCaptureStream: nativeOk,
    }) &&
    typeof document.createElement("canvas").captureStream === "function"
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, video.videoWidth || 640);
    canvas.height = Math.max(2, video.videoHeight || 360);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const draw = () => {
        if (video.ended) return;
        if (video.videoWidth >= 2) {
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        raf = window.requestAnimationFrame(draw);
      };
      draw();
      drawTimer = window.setInterval(draw, 33);
      const fromCanvas = canvas.captureStream(30);
      if (stream) {
        const audio = stream.getAudioTracks()[0];
        if (audio && !fromCanvas.getAudioTracks()[0]) fromCanvas.addTrack(audio);
        stream = fromCanvas;
      } else {
        stream = fromCanvas;
        const fromEl = mediaElementCaptureStream(el);
        const audio = fromEl?.getAudioTracks()[0];
        if (audio) stream.addTrack(audio);
      }
    }
  }
  if (!stream || (!stream.getVideoTracks()[0] && !stream.getAudioTracks()[0])) {
    if (raf) window.cancelAnimationFrame(raf);
    if (drawTimer) window.clearInterval(drawTimer);
    document.removeEventListener("visibilitychange", onVisible);
    failCleanup();
    return null;
  }
  for (const t of stream.getTracks()) t.enabled = true;
  const captured = stream;
  const videoTrack = captured.getVideoTracks()[0] ?? null;
  if (videoTrack) {
    try {
      videoTrack.contentHint = "motion";
    } catch {
      /* ignore */
    }
  }
  return {
    audio: captured.getAudioTracks()[0] ?? null,
    video: videoTrack,
    ...transportFromElement(el),
    stop() {
      if (raf) window.cancelAnimationFrame(raf);
      if (drawTimer) window.clearInterval(drawTimer);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
        el.remove();
      } catch {
        /* ignore */
      }
      for (const t of captured.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
