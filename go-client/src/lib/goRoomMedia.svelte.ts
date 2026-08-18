/**
 * 包廂鏡頭／投放 UI state — attach from guest/host room runtimes.
 */

import {
  createRoomMedia,
  type RoomMedia,
  type RoomMediaPeer,
  type RoomMediaState,
} from "./goRoomMedia";
import type { SessionCastMessage } from "@pg/roster/rosterSessionCast";
import type { SessionCameraMessage } from "@pg/roster/rosterSessionCamera";

const EMPTY: RoomMediaState = {
  camera: false,
  mic: false,
  programName: null,
  remoteProgramName: null,
  remoteProgramKind: null,
  presenceStream: null,
  programStream: null,
  localPreviewStream: null,
  error: null,
  cameraBlocked: true,
  remoteCameraOffered: false,
  watching: false,
};

class GoRoomMedia {
  camera = $state(false);
  mic = $state(false);
  programName = $state<string | null>(null);
  remoteProgramName = $state<string | null>(null);
  presenceStream = $state<MediaStream | null>(null);
  programStream = $state<MediaStream | null>(null);
  localPreviewStream = $state<MediaStream | null>(null);
  error = $state<string | null>(null);
  cameraBlocked = $state(true);
  remoteCameraOffered = $state(false);
  watching = $state(false);
  #media: RoomMedia | null = null;
  #unsub: (() => void) | null = null;

  attach(opts: {
    localAgentId: string;
    occupantCount: () => number;
    peers: () => RoomMediaPeer[];
    sendJson: (msg: SessionCastMessage | SessionCameraMessage) => void;
    forward?: boolean;
  }): void {
    this.detach();
    this.#media = createRoomMedia(opts);
    this.#unsub = this.#media.subscribe((s) => {
      this.camera = s.camera;
      this.mic = s.mic;
      this.programName = s.programName;
      this.remoteProgramName = s.remoteProgramName;
      this.presenceStream = s.presenceStream;
      this.programStream = s.programStream;
      this.localPreviewStream = s.localPreviewStream;
      this.error = s.error;
      this.cameraBlocked = s.cameraBlocked;
      this.remoteCameraOffered = s.remoteCameraOffered;
      this.watching = s.watching;
    });
  }

  detach(): void {
    this.#unsub?.();
    this.#unsub = null;
    this.#media?.dispose();
    this.#media = null;
    this.camera = EMPTY.camera;
    this.mic = EMPTY.mic;
    this.programName = EMPTY.programName;
    this.remoteProgramName = EMPTY.remoteProgramName;
    this.presenceStream = null;
    this.programStream = null;
    this.localPreviewStream = null;
    this.error = null;
    this.cameraBlocked = true;
    this.remoteCameraOffered = false;
    this.watching = false;
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

  watchCamera() {
    return (
      this.#media?.watchCamera() ??
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

  startProgram(file: File) {
    return (
      this.#media?.startProgram(file) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopProgram() {
    return this.#media?.stopProgram() ?? Promise.resolve();
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
