/**
 * 包廂在場／節目媒體：replaceTrack on booth 2+2；鏡頭僅 1:1；節目一路。
 */

import {
  boothSlotOfIndex,
  replaceBoothTrack,
  type BoothMediaKind,
  type BoothMediaLayer,
  type BoothTransceiverPc,
} from "@pg/roster/rosterBoothMedia";
import {
  buildSessionCastMessage,
  isSessionCastMessage,
  type SessionCastMessage,
} from "@pg/roster/rosterSessionCast";
import {
  buildSessionCameraMessage,
  isSessionCameraMessage,
  type SessionCameraMessage,
} from "@pg/roster/rosterSessionCamera";
import {
  GO_ROOM_CAMERA_PAIR_ONLY,
  GO_ROOM_CAST_UNSUPPORTED,
  GO_ROOM_MEDIA_PERM_DENIED,
  roomCameraAllowed,
} from "./goRoom";

export type RoomMediaPeer = {
  peerId: string;
  pc: BoothTransceiverPc;
  via: "entrance" | "mesh";
};

export type RoomMediaState = {
  camera: boolean;
  mic: boolean;
  programName: string | null;
  remoteProgramName: string | null;
  remoteProgramKind: "audio" | "video" | null;
  presenceStream: MediaStream | null;
  programStream: MediaStream | null;
  localPreviewStream: MediaStream | null;
  error: string | null;
  cameraBlocked: boolean;
  remoteCameraOffered: boolean;
  watching: boolean;
};

export type RoomMediaResult =
  | { ok: true }
  | { ok: false; error: string };

type CapturedProgram = {
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  stop: () => void;
};

export type RoomMedia = {
  enableCamera(): Promise<RoomMediaResult>;
  disableCamera(): Promise<void>;
  enableMic(): Promise<RoomMediaResult>;
  disableMic(): Promise<void>;
  startProgram(file: File): Promise<RoomMediaResult>;
  stopProgram(): Promise<void>;
  watchCamera(): Promise<RoomMediaResult>;
  stopWatching(): Promise<void>;
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
  const index =
    layer === "presence" ? (kind === "audio" ? 0 : 1) : kind === "audio" ? 2 : 3;
  const raw = (
    pc.getTransceivers()[index] as
      | { receiver?: { track?: MediaStreamTrack | null } }
      | undefined
  )?.receiver?.track;
  if (!raw || raw.kind !== kind) return null;
  if (raw.readyState && raw.readyState !== "live") return null;
  return raw;
}

export function createRoomMedia(opts: {
  localAgentId: string;
  occupantCount: () => number;
  peers: () => RoomMediaPeer[];
  sendJson: (msg: SessionCastMessage | SessionCameraMessage) => void;
  forward?: boolean;
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  captureProgram?: (file: File) => Promise<CapturedProgram | null>;
}): RoomMedia {
  const getUserMedia =
    opts.getUserMedia ??
    ((c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c));
  const listeners = new Set<(s: RoomMediaState) => void>();
  let camera: MediaStreamTrack | null = null;
  let mic: MediaStreamTrack | null = null;
  let program: CapturedProgram | null = null;
  let programName: string | null = null;
  let remoteProgramName: string | null = null;
  let remoteProgramKind: "audio" | "video" | null = null;
  let remotePresenceVideo: MediaStreamTrack | null = null;
  let remoteProgramVideo: MediaStreamTrack | null = null;
  let remoteProgramAudio: MediaStreamTrack | null = null;
  let error: string | null = null;
  let remoteCameraOffered = false;
  let watching = false;
  const watchers = new Set<string>();

  function snap(): RoomMediaState {
    const presenceTracks = watching
      ? [remotePresenceVideo].filter((t): t is MediaStreamTrack => Boolean(t))
      : [];
    const programTracks = [
      remoteProgramVideo,
      remoteProgramAudio,
      program?.video ?? null,
      program?.audio ?? null,
    ].filter((t): t is MediaStreamTrack => Boolean(t));
    const localTracks = [camera].filter((t): t is MediaStreamTrack => Boolean(t));
    return {
      camera: Boolean(camera),
      mic: Boolean(mic),
      programName,
      remoteProgramName,
      remoteProgramKind,
      presenceStream: streamOf(presenceTracks),
      programStream: streamOf(programTracks),
      localPreviewStream: streamOf(localTracks),
      error,
      cameraBlocked: !roomCameraAllowed(opts.occupantCount()),
      remoteCameraOffered,
      watching,
    };
  }

  function emit() {
    const s = snap();
    for (const l of listeners) l(s);
  }

  async function push(): Promise<void> {
    const allowed = roomCameraAllowed(opts.occupantCount());
    for (const peer of opts.peers()) {
      if (!peer.peerId) continue;
      const presenceVideo =
        allowed && camera && watchers.has(peer.peerId) ? camera : null;
      await replaceBoothTrack(peer.pc, "presence", "audio", mic);
      await replaceBoothTrack(peer.pc, "presence", "video", presenceVideo);
      await replaceBoothTrack(peer.pc, "program", "audio", program?.audio ?? null);
      await replaceBoothTrack(peer.pc, "program", "video", program?.video ?? null);
    }
  }

  async function stopTrack(t: MediaStreamTrack | null): Promise<void> {
    try {
      t?.stop();
    } catch {
      /* ignore */
    }
  }

  async function dropCamera(): Promise<void> {
    await stopTrack(camera);
    camera = null;
  }

  return {
    async enableCamera() {
      if (!roomCameraAllowed(opts.occupantCount())) {
        error = GO_ROOM_CAMERA_PAIR_ONLY;
        emit();
        return { ok: false, error: GO_ROOM_CAMERA_PAIR_ONLY };
      }
      try {
        const stream = await getUserMedia({ video: true, audio: false });
        await dropCamera();
        camera = stream.getVideoTracks()[0] ?? null;
        if (!camera) {
          error = GO_ROOM_MEDIA_PERM_DENIED;
          emit();
          return { ok: false, error: GO_ROOM_MEDIA_PERM_DENIED };
        }
        error = null;
        opts.sendJson(
          buildSessionCameraMessage({
            op: "offer",
            from: opts.localAgentId,
          })
        );
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
      if (camera) {
        opts.sendJson(
          buildSessionCameraMessage({
            op: "unoffer",
            from: opts.localAgentId,
          })
        );
      }
      watchers.clear();
      await dropCamera();
      await push();
      emit();
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
      await stopTrack(mic);
      mic = null;
      await push();
      emit();
    },
    async startProgram(file) {
      const capture = opts.captureProgram ?? captureProgramFromFile;
      const next = await capture(file);
      if (!next || (!next.audio && !next.video)) {
        error = GO_ROOM_CAST_UNSUPPORTED;
        emit();
        return { ok: false, error: GO_ROOM_CAST_UNSUPPORTED };
      }
      program?.stop();
      program = next;
      programName = file.name.trim() || "節目";
      remoteProgramName = null;
      remoteProgramKind = null;
      error = null;
      opts.sendJson(
        buildSessionCastMessage({
          op: "start",
          from: opts.localAgentId,
          kind: next.video ? "video" : "audio",
          name: programName,
        })
      );
      await push();
      emit();
      return { ok: true };
    },
    async stopProgram() {
      if (program || programName) {
        opts.sendJson(
          buildSessionCastMessage({ op: "stop", from: opts.localAgentId })
        );
      }
      program?.stop();
      program = null;
      programName = null;
      await push();
      emit();
    },
    async watchCamera() {
      if (!roomCameraAllowed(opts.occupantCount())) {
        error = GO_ROOM_CAMERA_PAIR_ONLY;
        emit();
        return { ok: false, error: GO_ROOM_CAMERA_PAIR_ONLY };
      }
      if (!remoteCameraOffered) {
        error = "對方還沒開鏡頭。";
        emit();
        return { ok: false, error: "對方還沒開鏡頭。" };
      }
      watching = true;
      error = null;
      opts.sendJson(
        buildSessionCameraMessage({
          op: "request",
          from: opts.localAgentId,
        })
      );
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
      remotePresenceVideo = null;
      emit();
    },
    async refresh() {
      if (camera && !roomCameraAllowed(opts.occupantCount())) {
        opts.sendJson(
          buildSessionCameraMessage({
            op: "unoffer",
            from: opts.localAgentId,
          })
        );
        watchers.clear();
        await dropCamera();
        error = GO_ROOM_CAMERA_PAIR_ONLY;
      }
      if (!roomCameraAllowed(opts.occupantCount())) {
        watching = false;
        remoteCameraOffered = false;
        remotePresenceVideo = null;
      }
      await push();
      emit();
    },
    async forwardFrom(fromPeerId) {
      if (!opts.forward) return;
      if (program) return;
      const peers = opts.peers();
      const from = peers.find((p) => p.peerId === fromPeerId);
      if (!from) return;
      for (const dest of peers) {
        if (dest.peerId === fromPeerId) continue;
        const audio = receiverTrack(from.pc, "program", "audio");
        const video = receiverTrack(from.pc, "program", "video");
        if (audio) await replaceBoothTrack(dest.pc, "program", "audio", audio);
        if (video) await replaceBoothTrack(dest.pc, "program", "video", video);
      }
    },
    async onControl(data) {
      if (isSessionCameraMessage(data)) {
        if (data.from === opts.localAgentId) return;
        if (data.op === "offer") {
          remoteCameraOffered = true;
          emit();
          return;
        }
        if (data.op === "unoffer") {
          remoteCameraOffered = false;
          watching = false;
          remotePresenceVideo = null;
          emit();
          return;
        }
        if (data.op === "request") {
          if (!camera || !roomCameraAllowed(opts.occupantCount())) return;
          watchers.add(data.from);
          await push();
          emit();
          return;
        }
        if (data.op === "release") {
          watchers.delete(data.from);
          await push();
          emit();
        }
        return;
      }
      if (!isSessionCastMessage(data)) return;
      if (data.from === opts.localAgentId) return;
      if (data.op === "start") {
        remoteProgramName = data.name?.trim() || "節目";
        remoteProgramKind = data.kind ?? "video";
        emit();
        return;
      }
      if (data.op === "stop") {
        remoteProgramName = null;
        remoteProgramKind = null;
        remoteProgramVideo = null;
        remoteProgramAudio = null;
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
      if (slot.layer === "presence" && slot.kind === "video") {
        if (!watching) return;
        remotePresenceVideo = ev.track;
      }
      if (slot.layer === "program" && slot.kind === "audio") {
        remoteProgramAudio = ev.track;
      }
      if (slot.layer === "program" && slot.kind === "video") {
        remoteProgramVideo = ev.track;
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
      void dropCamera();
      void stopTrack(mic);
      mic = null;
      program?.stop();
      program = null;
      programName = null;
      listeners.clear();
    },
  };
}

function streamOf(tracks: MediaStreamTrack[]): MediaStream | null {
  if (!tracks.length || typeof MediaStream !== "function") return null;
  try {
    return new MediaStream(tracks);
  } catch {
    return null;
  }
}

async function captureProgramFromFile(file: File): Promise<CapturedProgram | null> {
  if (typeof document === "undefined") return null;
  const mime = file.type || "";
  const isAudio = mime.startsWith("audio/");
  const el = document.createElement(isAudio ? "audio" : "video");
  const url = URL.createObjectURL(file);
  el.src = url;
  el.muted = true;
  el.autoplay = true;
  if ("playsInline" in el) {
    (el as HTMLVideoElement).playsInline = true;
  }
  const capture = (
    el as HTMLMediaElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    }
  ).captureStream;
  if (typeof capture !== "function") {
    URL.revokeObjectURL(url);
    return null;
  }
  try {
    await el.play();
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  let stream: MediaStream;
  try {
    stream = capture.call(el);
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  return {
    audio: stream.getAudioTracks()[0] ?? null,
    video: stream.getVideoTracks()[0] ?? null,
    stop() {
      try {
        el.pause();
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
      URL.revokeObjectURL(url);
    },
  };
}
