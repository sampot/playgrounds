/**
 * 包廂在場／節目媒體：replaceTrack on booth 2+2。
 * 節目＝房級電視；在場聲＝開麥即送；在場影像仍要 request（PG-GO-ROOM-PLAN §9.8）。
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
import { GO_ROOM_CAST_UNSUPPORTED, GO_ROOM_DISPLAY_PERM_DENIED, GO_ROOM_MEDIA_PERM_DENIED } from "./goRoom";

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
  /** Occupant whose live is on the TV; null when TV is off or a file. */
  tvSourcePeerId: string | null;
  /** Catalog file currently on the TV (local capture or remote offer id). */
  streamingFileId: string | null;
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
  | SessionBoothMessage;

export type RoomMedia = {
  enableCamera(): Promise<RoomMediaResult>;
  disableCamera(): Promise<void>;
  enableDisplay(): Promise<RoomMediaResult>;
  disableDisplay(): Promise<void>;
  enableMic(): Promise<RoomMediaResult>;
  disableMic(): Promise<void>;
  startProgram(file: File): Promise<RoomMediaResult>;
  startListedProgram(id: string): Promise<RoomMediaResult>;
  stopProgram(): Promise<void>;
  pauseProgram(): void;
  playProgram(): void;
  seekProgram(seconds: number): void;
  putLiveOnTv(peerId: string, name?: string): Promise<RoomMediaResult>;
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

export function createRoomMedia(opts: {
  localAgentId: string;
  occupantCount: () => number;
  peers: () => RoomMediaPeer[];
  sendJson: (msg: RoomMediaControl) => void;
  forward?: boolean;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (c?: DisplayMediaStreamOptions) => Promise<MediaStream>;
  captureProgram?: (file: File) => Promise<CapturedProgram | null>;
  resolveLocalFile?: (id: string) => File | null;
  ownerOf?: (id: string) => string | null;
}): RoomMedia {
  const getUserMedia =
    opts.getUserMedia ??
    ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const getDisplayMedia =
    opts.getDisplayMedia ??
    ((c?: DisplayMediaStreamOptions) =>
      navigator.mediaDevices.getDisplayMedia(c ?? { video: true, audio: false }));
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
  const cameraWatchers = new Set<string>();
  const micListeners = new Set<string>();
  const programWatchers = new Set<string>();
  let remoteLives: { peerId: string; camera: boolean; mic: boolean }[] = [];
  let presenceCache: { ids: string; stream: MediaStream } | null = null;
  let programCache: { ids: string; stream: MediaStream } | null = null;
  let localProgramCache: { ids: string; stream: MediaStream } | null = null;
  let localCache: { ids: string; stream: MediaStream } | null = null;

  function programClockState(): Pick<
    RoomMediaState,
    "programTransport" | "programPaused" | "programTime" | "programDuration"
  > {
    const clock = program?.clock?.() ?? null;
    if (!clock) {
      return {
        programTransport: false,
        programPaused: true,
        programTime: 0,
        programDuration: 0,
      };
    }
    return {
      programTransport: true,
      programPaused: clock.paused,
      programTime: clock.currentTime,
      programDuration: clock.duration,
    };
  }

  function snap(): RoomMediaState {
    const presenceTracks = [
      isLiveTrack(remotePresenceVideo) ? remotePresenceVideo : null,
      isLiveTrack(remotePresenceAudio) ? remotePresenceAudio : null,
    ].filter((t): t is MediaStreamTrack => Boolean(t));
    const programTracks = [remoteProgramVideo, remoteProgramAudio].filter(
      (t): t is MediaStreamTrack => Boolean(t) && isLiveTrack(t)
    );
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
    emit();
  }

  function collectRemoteFromPeers(): void {
    for (const peer of opts.peers()) {
      const pVid = receiverTrack(peer.pc, "presence", "video");
      const pAud = receiverTrack(peer.pc, "presence", "audio");
      const gVid = receiverTrack(peer.pc, "program", "video");
      const gAud = receiverTrack(peer.pc, "program", "audio");
      if (pVid) holdRemote({ layer: "presence", kind: "video" }, pVid);
      if (pAud) holdRemote({ layer: "presence", kind: "audio" }, pAud);
      if (gVid) holdRemote({ layer: "program", kind: "video" }, gVid);
      if (gAud) holdRemote({ layer: "program", kind: "audio" }, gAud);
    }
  }

  const ingestTimers: ReturnType<typeof setTimeout>[] = [];
  function scheduleIngest() {
    ingestNow();
    for (const ms of [80, 250, 1000]) {
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
  }

  function markAll(set: Set<string>): number {
    const before = set.size;
    for (const peer of opts.peers()) {
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
    const from = opts.peers().find((p) => p.peerId === tvSourcePeerId);
    if (!from) return;
    program = {
      audio: receiverTrack(from.pc, "presence", "audio"),
      video: receiverTrack(from.pc, "presence", "video"),
      stop() {},
    };
  }

  function offerProgram(): void {
    if (!program && !programName) return;
    opts.sendJson(
      buildSessionCastMessage({
        op: "offer",
        from: opts.localAgentId,
        kind: program?.video ? "video" : "audio",
        name: programName ?? "節目",
        id: streamingFileId ?? undefined,
      })
    );
  }

  async function push(): Promise<void> {
    for (const peer of opts.peers()) {
      if (!peer.peerId) continue;
      const presenceVideo =
        camera && cameraWatchers.has(peer.peerId) ? camera : null;
      const presenceAudio =
        mic && micListeners.has(peer.peerId) ? mic : null;
      const sendProgram = Boolean(program && programWatchers.has(peer.peerId));
      await replaceBoothTrack(peer.pc, "presence", "audio", presenceAudio);
      await replaceBoothTrack(peer.pc, "presence", "video", presenceVideo);
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
  }

  async function stopTrack(t: MediaStreamTrack | null): Promise<void> {
    try {
      t?.stop();
    } catch {
      /* ignore */
    }
  }

  let streamingFileId: string | null = null;
  let ownerDecodeUrl: string | null = null;
  let ownerDecodeKind: "audio" | "video" | null = null;
  let ownerDecodeEl: HTMLMediaElement | null = null;

  function bindProgramClock(next: CapturedProgram | null): void {
    const el = next?.mediaEl;
    if (!el) return;
    el.addEventListener("timeupdate", emit);
    el.addEventListener("play", emit);
    el.addEventListener("pause", emit);
    el.addEventListener("seeked", emit);
  }

  function revokeOwnerDecode(): void {
    if (ownerDecodeUrl) {
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
    quiet = false
  ): Promise<RoomMediaResult> {
    const capture = opts.captureProgram ?? captureProgramFromFile;
    const next = await capture(file);
    if (!next || (!next.audio && !next.video)) {
      if (!quiet) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
      }
      return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
    }
    program?.stop();
    program = next;
    programFromLive = false;
    tvSourcePeerId = null;
    programName = file.name.trim() || "影片";
    remoteProgramName = null;
    remoteProgramKind = null;
    error = null;
    bindProgramClock(next);
    return { ok: true };
  }

  function tryCaptureOwner(): RoomMediaResult {
    if (program && (program.audio || program.video)) return { ok: true };
    if (!ownerDecodeEl) {
      return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
    }
    const next = captureFromMediaElement(ownerDecodeEl);
    if (!next || (!next.audio && !next.video)) {
      return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
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
    const out = await captureLocalFile(file, quiet);
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
      await push();
      emit();
    },
    async startProgram(file) {
      const out = await captureLocalFile(file);
      if (!out.ok) return out;
      streamingFileId = null;
      markAll(programWatchers);
      offerProgram();
      await push();
      emit();
      return { ok: true };
    },
    async startListedProgram(id) {
      const out = await ensureCaptured(id);
      if (!out.ok) return out;
      markAll(programWatchers);
      offerProgram();
      await push();
      emit();
      return { ok: true };
    },
    pauseProgram() {
      program?.pause?.();
      emit();
    },
    playProgram() {
      program?.play?.();
      emit();
    },
    seekProgram(seconds) {
      program?.seek?.(seconds);
      emit();
    },
    async stopProgram() {
      if (program || programName) {
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
      streamingFileId = null;
      revokeOwnerDecode();
      await push();
      emit();
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
        const from = opts.peers().find((p) => p.peerId === peerId);
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
      error = null;
      markAll(programWatchers);
      offerProgram();
      await push();
      if (!local) await this.forwardFrom(peerId);
      emit();
      return { ok: true };
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
      ownerDecodeUrl = URL.createObjectURL(file);
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
      }
      if (mic) markAll(micListeners);
      await push();
      emit();
    },
    async forwardFrom(fromPeerId) {
      if (!opts.forward) return;
      const peers = opts.peers();
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
        if (!mic && micListeners.has(dest.peerId)) {
          const audio = receiverTrack(from.pc, "presence", "audio");
          if (audio) {
            await replaceBoothTrack(dest.pc, "presence", "audio", audio);
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
        if (audio) await replaceBoothTrack(dest.pc, "program", "audio", audio);
        if (video) await replaceBoothTrack(dest.pc, "program", "video", video);
      }
    },
    async onControl(data) {
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
          emit();
          return;
        }
        if (data.op === "request") {
          if (!mic && !opts.forward) return;
          micListeners.add(data.from);
          if (mic) await push();
          else if (opts.forward && remoteMicFrom && remoteMicFrom !== data.from) {
            await this.forwardFrom(remoteMicFrom);
          }
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
        remoteProgramName = data.name?.trim() || "節目";
        remoteProgramKind = data.kind ?? "video";
        remoteProgramFileId = data.id?.trim() || null;
        remoteProgramFrom = data.from;
        emit();
        if (!watchingProgram) void this.watchProgram();
        if (opts.forward) {
          markAll(programWatchers);
          await this.forwardFrom(data.from);
        }
        return;
      }
      if (data.op === "unoffer") {
        remoteProgramName = null;
        remoteProgramKind = null;
        remoteProgramFileId = null;
        remoteProgramFrom = null;
        watchingProgram = false;
        emit();
        return;
      }
      if (data.op === "request") {
        if (data.id) {
          return;
        }
        programWatchers.add(data.from);
        const peers = opts.peers().filter((p) => p.peerId);
        if (!peers.some((p) => p.peerId === data.from)) {
          for (const p of peers) programWatchers.add(p.peerId);
        }
        if (program) await push();
        const owner = remoteProgramFrom;
        if (opts.forward && owner && owner !== opts.localAgentId) {
          await this.forwardFrom(owner);
        }
        emit();
        return;
      }
      if (data.op === "reject") {
        if (data.id && watchingProgram) {
          watchingProgram = false;
          error = GO_ROOM_CAST_UNSUPPORTED;
          emit();
        }
        return;
      }
      if (data.op === "state") {
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
      liveSource = null;
      void dropCamera();
      void stopTrack(mic);
      mic = null;
      program?.stop();
      program = null;
      programName = null;
      streamingFileId = null;
      revokeOwnerDecode();
      clearIngest();
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
  const mime = (file.type || "").toLowerCase();
  const name = file.name || "";
  if (
    (mime.startsWith("audio/") && !mime.startsWith("video/")) ||
    /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(name)
  ) {
    return "audio";
  }
  return "video";
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
  const canCanvas =
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

async function captureProgramFromFile(file: File): Promise<CapturedProgram | null> {
  if (typeof document === "undefined") return null;
  const mime = file.type || "";
  const isAudio = mime.startsWith("audio/") && !mime.startsWith("video/");
  const el = document.createElement(isAudio ? "audio" : "video") as
    | HTMLVideoElement
    | HTMLAudioElement;
  const url = URL.createObjectURL(file);
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
  // Keep a real on-screen box: opacity 0 / off-screen often skips decode.
  el.style.cssText =
    "position:fixed;left:0;bottom:0;width:32px;height:18px;opacity:0.04;pointer-events:none;z-index:0;border:0;";
  if ("playsInline" in el) {
    (el as HTMLVideoElement).playsInline = true;
  }
  document.body.appendChild(el);
  el.src = url;
  el.load();

  const failCleanup = () => {
    try {
      el.pause();
      el.removeAttribute("src");
      el.load();
      el.remove();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(url);
  };

  const waitEvent = (name: string, ms: number) =>
    new Promise<boolean>((resolve) => {
      const t = window.setTimeout(() => resolve(false), ms);
      el.addEventListener(
        name,
        () => {
          window.clearTimeout(t);
          resolve(true);
        },
        { once: true }
      );
    });

  let sawError = false;
  el.addEventListener("error", () => {
    sawError = true;
  }, { once: true });
  await Promise.race([
    waitEvent("loadedmetadata", 8000),
    waitEvent("loadeddata", 8000),
    waitEvent("canplay", 8000),
  ]);
  if (sawError) {
    failCleanup();
    return null;
  }
  const tryPlay = () => {
    void el.play().catch(() => {
      /* Background tabs often reject play(); captureStream can still attach. */
    });
  };
  tryPlay();
  const onVisible = () => {
    if (!document.hidden) tryPlay();
  };
  document.addEventListener("visibilitychange", onVisible);

  let raf = 0;
  let drawTimer = 0;
  let stream = mediaElementCaptureStream(el);
  const video = el as HTMLVideoElement;
  if (
    !isAudio &&
    (!stream || !stream.getVideoTracks()[0]) &&
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
  return {
    audio: captured.getAudioTracks()[0] ?? null,
    video: captured.getVideoTracks()[0] ?? null,
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
      URL.revokeObjectURL(url);
    },
  };
}
