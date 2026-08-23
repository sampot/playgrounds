/**
 * FIFO Guest join handshake queue for BoothAnchor DO (ENGINE §10.7).
 */

export type BoothJoinPending = {
  joinId: string;
  inviteId: string;
  offerWire: string;
  createdAt: number;
};

export type BoothJoinQueueState = {
  active: BoothJoinPending | null;
  queue: BoothJoinPending[];
  answers: Record<string, string>;
};

export function createEmptyBoothJoinQueue(): BoothJoinQueueState {
  return { active: null, queue: [], answers: {} };
}

/** Enqueue a join; returns the pending that should be offered to Engine (if any). */
export function enqueueBoothJoin(
  state: BoothJoinQueueState,
  pending: BoothJoinPending
): BoothJoinPending | null {
  if (!state.active) {
    state.active = pending;
    return pending;
  }
  state.queue.push(pending);
  return null;
}

export function storeBoothJoinAnswer(
  state: BoothJoinQueueState,
  joinId: string,
  answerWire: string
): BoothJoinPending | null {
  if (!state.active || state.active.joinId !== joinId) {
    return null;
  }
  state.answers[joinId] = answerWire;
  state.active = state.queue.shift() ?? null;
  return state.active;
}

export function takeBoothJoinAnswer(
  state: BoothJoinQueueState,
  joinId: string
): string | undefined {
  const ans = state.answers[joinId];
  if (ans !== undefined) delete state.answers[joinId];
  return ans;
}
