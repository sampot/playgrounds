/**
 * Operator Roster node presence (session_camera／session_mic on Hub leaf PC).
 */

import {
  applyBoothVideoCodecPreferences,
  replaceBoothTrack,
} from "@pg/roster/rosterBoothMedia";
import {
  buildSessionCameraMessage,
  buildSessionMicMessage,
} from "@pg/roster/rosterSessionCamera";

export type OperatorPresenceState = {
  camera: boolean;
  mic: boolean;
  error: string | null;
};

export function createOperatorPresence(opts: {
  peerId: string;
  getPc: () => RTCPeerConnection | null;
  send: (data: unknown) => void;
  onChange: (state: OperatorPresenceState) => void;
  getUserMedia?: (
    constraints: MediaStreamConstraints
  ) => Promise<MediaStream>;
}) {
  const getUserMedia =
    opts.getUserMedia ??
    ((constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints));

  let cameraTrack: MediaStreamTrack | null = null;
  let micTrack: MediaStreamTrack | null = null;
  let camera = false;
  let mic = false;
  let error: string | null = null;

  function emit(): void {
    opts.onChange({ camera, mic, error });
  }

  async function stopTrack(track: MediaStreamTrack | null): Promise<void> {
    if (!track) return;
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }

  async function pushTracks(): Promise<void> {
    const pc = opts.getPc();
    if (!pc) return;
    applyBoothVideoCodecPreferences(pc);
    await replaceBoothTrack(pc, "presence", "video", cameraTrack);
    await replaceBoothTrack(pc, "presence", "audio", micTrack);
  }

  return {
    getState(): OperatorPresenceState {
      return { camera, mic, error };
    },
    async enableCamera(): Promise<{ ok: true } | { ok: false; error: string }> {
      try {
        const stream = await getUserMedia({ video: true, audio: false });
        await stopTrack(cameraTrack);
        cameraTrack = stream.getVideoTracks()[0] ?? null;
        if (!cameraTrack) {
          error = "無法開啟鏡頭";
          emit();
          return { ok: false, error };
        }
        if (!camera) {
          opts.send(
            buildSessionCameraMessage({ op: "offer", from: opts.peerId })
          );
        }
        camera = true;
        error = null;
        await pushTracks();
        emit();
        return { ok: true };
      } catch {
        error = "鏡頭權限被拒或無法使用";
        emit();
        return { ok: false, error };
      }
    },
    async disableCamera(): Promise<void> {
      if (!camera) return;
      opts.send(
        buildSessionCameraMessage({ op: "unoffer", from: opts.peerId })
      );
      camera = false;
      await stopTrack(cameraTrack);
      cameraTrack = null;
      await pushTracks();
      emit();
    },
    async enableMic(): Promise<{ ok: true } | { ok: false; error: string }> {
      try {
        const stream = await getUserMedia({ audio: true, video: false });
        await stopTrack(micTrack);
        micTrack = stream.getAudioTracks()[0] ?? null;
        if (!micTrack) {
          error = "無法開啟麥克風";
          emit();
          return { ok: false, error };
        }
        if (!mic) {
          opts.send(
            buildSessionMicMessage({ op: "offer", from: opts.peerId })
          );
        }
        mic = true;
        error = null;
        await pushTracks();
        emit();
        return { ok: true };
      } catch {
        error = "麥克風權限被拒或無法使用";
        emit();
        return { ok: false, error };
      }
    },
    async disableMic(): Promise<void> {
      if (!mic) return;
      opts.send(buildSessionMicMessage({ op: "unoffer", from: opts.peerId }));
      mic = false;
      await stopTrack(micTrack);
      micTrack = null;
      await pushTracks();
      emit();
    },
    async dispose(): Promise<void> {
      await stopTrack(cameraTrack);
      await stopTrack(micTrack);
      cameraTrack = null;
      micTrack = null;
      camera = false;
      mic = false;
      emit();
    },
  };
}
