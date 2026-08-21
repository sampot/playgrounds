/**
 * Booth session_play state (PG-GO-ROOM-PLAY-PLAN §6).
 * Control plane only — does not load SAM or open avatar_relay.
 */

import {
  buildSessionPlayEnd,
  buildSessionPlayOffer,
  isSessionPlayMessage,
  type SessionPlayMessage,
  type SessionPlayOfferMessage,
  type SessionPlaySeat,
} from "@pg/roster/rosterSessionPlay";

export type RoomSessionPlayPhase = "idle" | "loading" | "active";

export type RoomSessionPlayState = {
  phase: RoomSessionPlayPhase;
  catalogId: string | null;
  rev: string | null;
  seats: SessionPlaySeat[];
  /** peerId that issued the current offer (booth host). */
  fromHost: string | null;
};

export type RoomSessionPlayApplyResult =
  | { ok: true; state: RoomSessionPlayState }
  | { ok: false; reason: "not_host" | "bad_message" | "idle" };

const IDLE: RoomSessionPlayState = {
  phase: "idle",
  catalogId: null,
  rev: null,
  seats: [],
  fromHost: null,
};

function cloneState(s: RoomSessionPlayState): RoomSessionPlayState {
  return {
    phase: s.phase,
    catalogId: s.catalogId,
    rev: s.rev,
    seats: s.seats.map((x) => ({ role: x.role, peerId: x.peerId })),
    fromHost: s.fromHost,
  };
}

export function createRoomSessionPlay(opts: {
  /** Local peer id (host or guest). */
  localPeerId: () => string;
  /** Booth director peer id — only this id may offer／end. */
  hostPeerId: () => string;
  /** When true, local is the booth host (may call hostOffer／hostEnd). */
  isBoothHost: () => boolean;
}): {
  getState: () => RoomSessionPlayState;
  /** Host: begin a play (phase → loading). Returns wire message to fanout. */
  hostOffer: (input: {
    catalogId: string;
    rev?: string;
    seats: readonly SessionPlaySeat[];
  }) =>
    | { ok: true; message: SessionPlayOfferMessage; state: RoomSessionPlayState }
    | { ok: false; reason: "not_host" | "empty" };
  /** Host: end play. Returns wire message to fanout (or null if already idle). */
  hostEnd: () =>
    | { ok: true; message: SessionPlayMessage; state: RoomSessionPlayState }
    | { ok: false; reason: "not_host" | "idle" };
  /** Apply inbound wire (Guest, or Host echo ignore). */
  applyRemote: (data: unknown) => RoomSessionPlayApplyResult;
  /** Mark local SAM ready → active (after loading). */
  markActive: () => RoomSessionPlayState;
  /** Snapshot offer for late join (null if idle). */
  snapshotOffer: () => SessionPlayOfferMessage | null;
  seatRoleFor: (peerId: string) => string | null;
  isSpectator: (peerId: string) => boolean;
  reset: () => void;
} {
  let state = cloneState(IDLE);

  function setOffer(msg: SessionPlayOfferMessage): RoomSessionPlayState {
    state = {
      phase: "loading",
      catalogId: msg.catalogId,
      rev: msg.rev ?? null,
      seats: msg.seats.map((s) => ({ role: s.role, peerId: s.peerId })),
      fromHost: msg.from,
    };
    return cloneState(state);
  }

  function setIdle(): RoomSessionPlayState {
    state = cloneState(IDLE);
    return cloneState(state);
  }

  return {
    getState: () => cloneState(state),

    hostOffer(input) {
      if (!opts.isBoothHost()) return { ok: false, reason: "not_host" };
      const catalogId = input.catalogId.trim();
      if (!catalogId || input.seats.length === 0) {
        return { ok: false, reason: "empty" };
      }
      const from = opts.localPeerId();
      const message = buildSessionPlayOffer({
        from,
        catalogId,
        rev: input.rev,
        seats: input.seats,
      });
      if (!isSessionPlayMessage(message)) {
        return { ok: false, reason: "empty" };
      }
      return { ok: true, message, state: setOffer(message) };
    },

    hostEnd() {
      if (!opts.isBoothHost()) return { ok: false, reason: "not_host" };
      if (state.phase === "idle") return { ok: false, reason: "idle" };
      const message = buildSessionPlayEnd({ from: opts.localPeerId() });
      return { ok: true, message, state: setIdle() };
    },

    applyRemote(data) {
      if (!isSessionPlayMessage(data)) {
        return { ok: false, reason: "bad_message" };
      }
      const hostId = opts.hostPeerId();
      if (data.from !== hostId) {
        return { ok: false, reason: "not_host" };
      }
      if (data.op === "end") {
        if (state.phase === "idle") return { ok: false, reason: "idle" };
        return { ok: true, state: setIdle() };
      }
      return { ok: true, state: setOffer(data) };
    },

    markActive() {
      if (state.phase === "loading") {
        state = { ...state, phase: "active" };
      }
      return cloneState(state);
    },

    snapshotOffer() {
      if (state.phase === "idle" || !state.catalogId || !state.fromHost) {
        return null;
      }
      return buildSessionPlayOffer({
        from: state.fromHost,
        catalogId: state.catalogId,
        rev: state.rev ?? undefined,
        seats: state.seats,
      });
    },

    seatRoleFor(peerId) {
      const row = state.seats.find((s) => s.peerId === peerId);
      return row?.role ?? null;
    },

    isSpectator(peerId) {
      if (state.phase === "idle") return false;
      return !state.seats.some((s) => s.peerId === peerId);
    },

    reset() {
      setIdle();
    },
  };
}

export type RoomSessionPlayController = ReturnType<typeof createRoomSessionPlay>;

/**
 * Guest booth shell `message` after a domain session event.
 * `""` = clear seat-wait copy so occupancy／TV status can show;
 * `undefined` = leave the current shell message alone.
 */
export function roomGuestShellMessageFromSessionEvent(
  event: unknown
): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const o = event as { type?: unknown; status?: unknown };
  const type = typeof o.type === "string" ? o.type : "";
  if (
    type === "match.started" ||
    type === "match.placed" ||
    type === "match.reset"
  ) {
    return "";
  }
  if (type === "match.status") {
    const status = typeof o.status === "string" ? o.status : "";
    if (status === "active" || status === "ended") return "";
  }
  return undefined;
}

