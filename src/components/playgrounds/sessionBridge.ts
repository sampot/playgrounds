/**
 * Shell-registered session API for Participant Agent functions.js (DEC-023).
 * Injected as env.SESSION when sandboxId is a seated participant.
 */

import {
  SESSION_API_VERSION,
  SESSION_CAPABILITIES,
  type SessionCapability,
} from "./sessionCapabilities";

export class SessionBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionBridgeError";
    this.code = code;
  }
}

export interface SessionSeatInfo {
  sessionId: string;
  seatId: string;
  role: string;
  participantId: string;
  hostSandboxId: string;
  status: "open" | "paused";
}

export interface SessionBridge {
  apiVersion(): Promise<string>;
  capabilities(): Promise<SessionCapability[]>;
  getSeat(): Promise<SessionSeatInfo>;
  getState(): Promise<unknown>;
  getEventChannel(): Promise<{ name: string }>;
  act(payload: unknown): Promise<unknown>;
  leave(): Promise<{ ok: true }>;
}

const bridgesBySeat = new Map<string, SessionBridge>();
/** sandboxId → seatId for env injection lookup. */
const seatBySandboxId = new Map<string, string>();

export function registerSessionBridge(
  seatId: string,
  sandboxId: string,
  impl: SessionBridge | null
): void {
  if (!impl) {
    bridgesBySeat.delete(seatId);
    for (const [pid, sid] of seatBySandboxId) {
      if (sid === seatId) seatBySandboxId.delete(pid);
    }
    return;
  }
  bridgesBySeat.set(seatId, impl);
  seatBySandboxId.set(sandboxId, seatId);
}

export function clearAllSessionBridges(): void {
  bridgesBySeat.clear();
  seatBySandboxId.clear();
}

export function getSessionSeatIdForProject(sandboxId: string): string | null {
  return seatBySandboxId.get(sandboxId) ?? null;
}

export function getSessionBridge(seatId: string): SessionBridge | null {
  return bridgesBySeat.get(seatId) ?? null;
}

export function createSessionBinding(sandboxId: string): SessionBridge {
  return {
    apiVersion: async () => requireBridge(sandboxId).apiVersion(),
    capabilities: async () => requireBridge(sandboxId).capabilities(),
    getSeat: async () => requireBridge(sandboxId).getSeat(),
    getState: async () => requireBridge(sandboxId).getState(),
    getEventChannel: async () => requireBridge(sandboxId).getEventChannel(),
    act: async payload => requireBridge(sandboxId).act(payload),
    leave: async () => requireBridge(sandboxId).leave(),
  };
}

function requireBridge(sandboxId: string): SessionBridge {
  const seatId = seatBySandboxId.get(sandboxId);
  if (!seatId) {
    throw new SessionBridgeError(
      "session_inactive",
      "此沙盒未入座 multi-agent session"
    );
  }
  const bridge = bridgesBySeat.get(seatId);
  if (!bridge) {
    throw new SessionBridgeError(
      "session_inactive",
      "Playgrounds session bridge 尚未就緒"
    );
  }
  return bridge;
}

export { SESSION_API_VERSION, SESSION_CAPABILITIES };
export type { SessionCapability };
