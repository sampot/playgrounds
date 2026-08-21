/**
 * 包廂鏡頭／節目 UI state — attach from guest/host room runtimes.
 */

import {
  createRoomMedia,
  type RoomMedia,
  type RoomMediaControl,
  type RoomMediaPeer,
  type RoomMediaState,
} from "./goRoomMedia";

const EMPTY: RoomMediaState = {
  camera: false,
  mic: false,
  display: false,
  programName: null,
  remoteProgramName: null,
  remoteProgramKind: null,
  presenceStream: null,
  programStream: null,
  localProgramStream: null,
  localPreviewStream: null,
  ownerDecodeUrl: null,
  ownerDecodeKind: null,
  programTransport: false,
  programPaused: true,
  programTime: 0,
  programDuration: 0,
  error: null,
  cameraBlocked: false,
  remoteCameraOffered: false,
  watching: false,
  remoteMicOffered: false,
  listening: false,
  watchingProgram: false,
  remoteLives: [],
  tvSourcePeerId: null,
  streamingFileId: null,
  programScope: null,
};

class GoRoomMedia {
  camera = $state(false);
  mic = $state(false);
  display = $state(false);
  programName = $state<string | null>(null);
  remoteProgramName = $state<string | null>(null);
  presenceStream = $state<MediaStream | null>(null);
  programStream = $state<MediaStream | null>(null);
  localProgramStream = $state<MediaStream | null>(null);
  localPreviewStream = $state<MediaStream | null>(null);
  ownerDecodeUrl = $state<string | null>(null);
  ownerDecodeKind = $state<"audio" | "video" | null>(null);
  programTransport = $state(false);
  programPaused = $state(true);
  programTime = $state(0);
  programDuration = $state(0);
  error = $state<string | null>(null);
  cameraBlocked = $state(false);
  remoteCameraOffered = $state(false);
  watching = $state(false);
  remoteMicOffered = $state(false);
  listening = $state(false);
  watchingProgram = $state(false);
  remoteLives = $state<{ peerId: string; camera: boolean; mic: boolean }[]>([]);
  tvSourcePeerId = $state<string | null>(null);
  streamingFileId = $state<string | null>(null);
  programScope = $state<"share" | "private" | null>(null);
  #media: RoomMedia | null = null;
  #unsub: (() => void) | null = null;

  attach(opts: {
    localAgentId: string;
    occupantCount: () => number;
    peers: () => RoomMediaPeer[];
    sendJson: (msg: RoomMediaControl) => void;
    forward?: boolean;
    resolveLocalFile?: (id: string) => File | null;
    resolvePrivateFile?: (id: string) => Promise<File | null>;
    ownerOf?: (id: string) => string | null;
    fileMeta?: (id: string) => { name: string; kind: "audio" | "video" } | null;
  }): void {
    this.detach();
    this.#media = createRoomMedia(opts);
    this.#unsub = this.#media.subscribe((s) => {
      this.camera = s.camera;
      this.mic = s.mic;
      this.display = s.display;
      this.programName = s.programName;
      this.remoteProgramName = s.remoteProgramName;
      this.presenceStream = s.presenceStream;
      this.programStream = s.programStream;
      this.localProgramStream = s.localProgramStream;
      this.localPreviewStream = s.localPreviewStream;
      this.ownerDecodeUrl = s.ownerDecodeUrl;
      this.ownerDecodeKind = s.ownerDecodeKind;
      this.programTransport = s.programTransport;
      this.programPaused = s.programPaused;
      this.programTime = s.programTime;
      this.programDuration = s.programDuration;
      this.error = s.error;
      this.cameraBlocked = s.cameraBlocked;
      this.remoteCameraOffered = s.remoteCameraOffered;
      this.watching = s.watching;
      this.remoteMicOffered = s.remoteMicOffered;
      this.listening = s.listening;
      this.watchingProgram = s.watchingProgram;
      this.remoteLives = s.remoteLives;
      this.tvSourcePeerId = s.tvSourcePeerId;
      this.streamingFileId = s.streamingFileId;
      this.programScope = s.programScope;
    });
  }

  detach(): void {
    this.#unsub?.();
    this.#unsub = null;
    this.#media?.dispose();
    this.#media = null;
    this.camera = EMPTY.camera;
    this.mic = EMPTY.mic;
    this.display = EMPTY.display;
    this.programName = EMPTY.programName;
    this.remoteProgramName = EMPTY.remoteProgramName;
    this.presenceStream = null;
    this.programStream = null;
    this.localProgramStream = null;
    this.localPreviewStream = null;
    this.ownerDecodeUrl = null;
    this.ownerDecodeKind = null;
    this.programTransport = false;
    this.programPaused = true;
    this.programTime = 0;
    this.programDuration = 0;
    this.error = null;
    this.cameraBlocked = false;
    this.remoteCameraOffered = false;
    this.watching = false;
    this.remoteMicOffered = false;
    this.listening = false;
    this.watchingProgram = false;
    this.remoteLives = [];
    this.tvSourcePeerId = null;
    this.streamingFileId = null;
    this.programScope = null;
  }

  enableCamera() {
    return (
      this.#media?.enableCamera() ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  disableCamera() {
    return this.#media?.disableCamera() ?? Promise.resolve();
  }

  enableDisplay() {
    return (
      this.#media?.enableDisplay() ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  disableDisplay() {
    return this.#media?.disableDisplay() ?? Promise.resolve();
  }

  watchCamera() {
    return (
      this.#media?.watchCamera() ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  watchLive(peerId: string) {
    return (
      this.#media?.watchLive(peerId) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopWatching() {
    return this.#media?.stopWatching() ?? Promise.resolve();
  }

  enableMic() {
    return (
      this.#media?.enableMic() ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  disableMic() {
    return this.#media?.disableMic() ?? Promise.resolve();
  }

  listenMic() {
    return (
      this.#media?.listenMic() ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopListening() {
    return this.#media?.stopListening() ?? Promise.resolve();
  }

  startListedProgram(id: string) {
    return (
      this.#media?.startListedProgram(id) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  startPrivateProgram(id: string) {
    return (
      this.#media?.startPrivateProgram(id) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  startProgram(file: File) {
    return (
      this.#media?.startProgram(file) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopProgram() {
    return this.#media?.stopProgram() ?? Promise.resolve();
  }

  pauseProgram() {
    this.#media?.pauseProgram();
  }

  playProgram() {
    this.#media?.playProgram();
  }

  seekProgram(seconds: number) {
    this.#media?.seekProgram(seconds);
  }

  putLiveOnTv(peerId: string, name?: string) {
    return (
      this.#media?.putLiveOnTv(peerId, name) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  haltLive(peerId: string, layer: "audio" | "video") {
    return (
      this.#media?.haltLive(peerId, layer) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  warmProgram(id: string) {
    return (
      this.#media?.warmProgram(id) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopStreamingFile(id: string) {
    return this.#media?.stopStreamingFile(id) ?? Promise.resolve();
  }

  captureFromElement(el: HTMLMediaElement) {
    return (
      this.#media?.captureFromElement(el) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  watchProgram(id?: string) {
    return (
      this.#media?.watchProgram(id) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopWatchingProgram() {
    return this.#media?.stopWatchingProgram() ?? Promise.resolve();
  }

  refresh() {
    return this.#media?.refresh() ?? Promise.resolve();
  }

  forwardFrom(fromPeerId: string) {
    return this.#media?.forwardFrom(fromPeerId) ?? Promise.resolve();
  }

  onCastControl(data: unknown): void {
    void this.#media?.onControl(data);
  }

  onRemoteTrack(
    ev: RTCTrackEvent,
    pc: { getTransceivers: () => unknown[] }
  ): void {
    this.#media?.onRemoteTrack(ev, pc as Parameters<RoomMedia["onRemoteTrack"]>[1]);
  }
}

export const goRoomMedia = new GoRoomMedia();
