/**
 * Host-side Ticket answer loop (DEC-047).
 * Serializes acceptRosterOffer → putAnswer.
 * Default: keep answering (multi-peer). Pass maxAnswers: 1 for roster-only invites.
 */

import {
  acceptRosterOffer,
  type RosterPeerHandlers,
  type RosterPeerSession,
} from "../roster";
import {
  fetchHostTurnIceServers,
  pollPendingOffer,
  putAnswer,
} from "./platformClient";

export type PlatformHostLoopHandle = {
  stop: () => void;
  inviteId: string;
};

export function startPlatformHostAnswerLoop(opts: {
  inviteId: string;
  apiKey: string;
  lan?: boolean;
  localPresence: { agentId: string; name: string };
  /** Called before each accept so the panel can point handlers at the next PC. */
  prepareHandlers: () => {
    handlers: RosterPeerHandlers;
    attachSession: (session: RosterPeerSession) => void;
  };
  /**
   * Stop after this many successful answers. Omit／0 = unlimited (compose multi-join).
   * Roster connection invites use 1.
   */
  maxAnswers?: number;
  onStatus?: (msg: string) => void;
  onError?: (msg: string) => void;
  /** After a successful answer (before maxAnswers check). */
  onAnswered?: (info: {
    joinId: string;
    answerCount: number;
  }) => void | Promise<void>;
  /** When the loop stops after reaching maxAnswers. */
  onDone?: () => void;
}): PlatformHostLoopHandle {
  const ac = new AbortController();
  const inviteId = opts.inviteId;
  const maxAnswers =
    typeof opts.maxAnswers === "number" && opts.maxAnswers > 0
      ? opts.maxAnswers
      : 0;
  let answerCount = 0;

  void (async () => {
    while (!ac.signal.aborted) {
      try {
        const pending = await pollPendingOffer({
          inviteId,
          apiKey: opts.apiKey,
          waitMs: 25_000,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!pending) continue;

        opts.onStatus?.(
          `排隊握手中（join ${pending.join_id.slice(0, 6)}…）`
        );
        const iceServers = opts.lan
          ? undefined
          : ((await fetchHostTurnIceServers({
              apiKey: opts.apiKey,
              sessionId: pending.join_id,
            })) ?? undefined);
        const prepared = opts.prepareHandlers();
        const { session, wire } = await acceptRosterOffer({
          offerWire: pending.offer,
          lan: opts.lan,
          transport: "signal",
          localPresence: opts.localPresence,
          handlers: prepared.handlers,
          iceServers,
        });
        prepared.attachSession(session);
        await putAnswer({
          inviteId,
          apiKey: opts.apiKey,
          answerWire: wire,
        });
        answerCount += 1;
        await opts.onAnswered?.({
          joinId: pending.join_id,
          answerCount,
        });
        if (maxAnswers > 0 && answerCount >= maxAnswers) {
          opts.onStatus?.("對方已連上");
          opts.onDone?.();
          ac.abort();
          return;
        }
        opts.onStatus?.("已回覆一筆邀請，繼續等待下一位…");
      } catch (e) {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "aborted" || msg === "empty") continue;
        opts.onError?.(msg);
        await new Promise(r => setTimeout(r, 800));
      }
    }
  })();

  return {
    inviteId,
    stop() {
      ac.abort();
    },
  };
}
