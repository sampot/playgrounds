/**
 * Presence-camera control over Roster DataChannel.
 * Hang／pull like session_file: opening the camera does not send RTP until
 * the other person requests to watch (PG-GO-ROOM-PLAN §9.5).
 */

export const SESSION_CAMERA_TYPE = "session_camera" as const;
export const SESSION_CAMERA_VERSION = 1 as const;

export type SessionCameraOp = "offer" | "unoffer" | "request" | "release";

export type SessionCameraMessage = {
  type: typeof SESSION_CAMERA_TYPE;
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

export function isSessionCameraMessage(
  data: unknown
): data is SessionCameraMessage {
  if (!data || typeof data !== "object") return false;
  const m = data as Record<string, unknown>;
  if (m.type !== SESSION_CAMERA_TYPE) return false;
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
