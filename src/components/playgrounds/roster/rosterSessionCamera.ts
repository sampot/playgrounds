/**
 * Presence-camera control over Roster DataChannel.
 * Hang／pull like session_file: opening the camera does not send RTP until
 * the other person requests to watch (PG-GO-ROOM-PLAN §9.5).
 */

export const SESSION_CAMERA_TYPE = "session_camera" as const;
export const SESSION_MIC_TYPE = "session_mic" as const;
export const SESSION_CAMERA_VERSION = 1 as const;

export type SessionCameraOp = "offer" | "unoffer" | "request" | "release";

export type SessionCameraMessage = {
  type: typeof SESSION_CAMERA_TYPE;
  v: typeof SESSION_CAMERA_VERSION;
  op: SessionCameraOp;
  from: string;
};

export type SessionMicMessage = {
  type: typeof SESSION_MIC_TYPE;
  v: typeof SESSION_CAMERA_VERSION;
  op: SessionCameraOp;
  from: string;
};

const CAMERA_OPS = new Set<SessionCameraOp>([
  "offer",
  "unoffer",
  "request",
  "release",
]);
const ID_MAX = 128;

function isLiveMediaMessage(
  data: unknown,
  type: typeof SESSION_CAMERA_TYPE | typeof SESSION_MIC_TYPE
): data is SessionCameraMessage | SessionMicMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== type) return false;
  if (m.v !== SESSION_CAMERA_VERSION) return false;
  if (typeof m.op !== "string" || !CAMERA_OPS.has(m.op as SessionCameraOp)) {
    return false;
  }
  return (
    typeof m.from === "string" &&
    m.from.length > 0 &&
    m.from.length <= ID_MAX
  );
}

export function isSessionCameraMessage(
  data: unknown
): data is SessionCameraMessage {
  return isLiveMediaMessage(data, SESSION_CAMERA_TYPE);
}

export function isSessionMicMessage(data: unknown): data is SessionMicMessage {
  return isLiveMediaMessage(data, SESSION_MIC_TYPE);
}

export function buildSessionCameraMessage(opts: {
  op: SessionCameraOp;
  from: string;
}): SessionCameraMessage {
  return {
    type: SESSION_CAMERA_TYPE,
    v: SESSION_CAMERA_VERSION,
    op: opts.op,
    from: opts.from,
  };
}

export function buildSessionMicMessage(opts: {
  op: SessionCameraOp;
  from: string;
}): SessionMicMessage {
  return {
    type: SESSION_MIC_TYPE,
    v: SESSION_CAMERA_VERSION,
    op: opts.op,
    from: opts.from,
  };
}
