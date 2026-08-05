/**
 * Correlate homePeer SESSION.act requests over Roster DataChannel (DEC-045 Phase 3.2).
 */

import { SessionBridgeError } from "../sessionBridge";
import {
  SESSION_ACT_KIND,
  SESSION_ACT_RESULT_KIND,
  newSessionActRequestId,
  type SessionActPayload,
  type SessionActResultPayload,
} from "./rosterSessionBridge";

export const DEFAULT_SESSION_ACT_TIMEOUT_MS = 20_000;

type Pending = {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();

export function clearSessionActPendingForTests(): void {
  for (const p of pending.values()) clearTimeout(p.timer);
  pending.clear();
}

export function resolveSessionActResult(
  data: SessionActResultPayload
): boolean {
  const wait = pending.get(data.requestId);
  if (!wait) return false;
  clearTimeout(wait.timer);
  pending.delete(data.requestId);
  if (data.ok) {
    wait.resolve(data.result);
  } else {
    wait.reject(
      new SessionBridgeError(
        data.error?.code || "act_rejected",
        data.error?.message || "遠端 act 失敗"
      )
    );
  }
  return true;
}

/**
 * Send session_act and wait for matching session_act_result.
 */
export function requestSessionActOverRelay(opts: {
  inviteId: string;
  sessionId: string;
  seatId: string;
  payload: unknown;
  send: (msg: SessionActPayload, to?: string) => void;
  toPeerId?: string;
  timeoutMs?: number;
  requestId?: string;
}): Promise<unknown> {
  const requestId = opts.requestId?.trim() || newSessionActRequestId();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SESSION_ACT_TIMEOUT_MS;
  const act: SessionActPayload = {
    kind: SESSION_ACT_KIND,
    inviteId: opts.inviteId,
    sessionId: opts.sessionId,
    seatId: opts.seatId,
    requestId,
    payload: opts.payload,
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(
        new SessionBridgeError("timeout", "遠端 session act 逾時")
      );
    }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    try {
      opts.send(act, opts.toPeerId);
    } catch (e) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function buildSessionActResultPayload(opts: {
  requestId: string;
  sessionId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}): SessionActResultPayload {
  const out: SessionActResultPayload = {
    kind: SESSION_ACT_RESULT_KIND,
    requestId: opts.requestId,
    sessionId: opts.sessionId,
    ok: opts.ok,
  };
  if (opts.ok) {
    if (opts.result !== undefined) out.result = opts.result;
  } else if (opts.error) {
    out.error = opts.error;
  }
  return out;
}
