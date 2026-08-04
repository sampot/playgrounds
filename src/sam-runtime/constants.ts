/**
 * Agent Model runtime constants (DEC-031 / AGENT-MODEL-PLAN).
 */

/** Max delivery attempts including the first; then poison. */
export const N_MAX_ATTEMPTS = 3;

/** Max unacked + inFlight messages per agent mailbox. */
export const MAILBOX_CAPACITY = 1000;

/** Recent acked message ids retained for dedupe (per agent). */
export const DEDUPE_WINDOW_SIZE = 512;

/** Delay before retrying a failed delivery (ms). 0 = immediate in tests. */
export const RETRY_DELAY_MS = 0;

/** Formal heartbeat older than this → followers may contend for the lock. */
export const T_HEARTBEAT_MS = 2000;

/** After acquiring the lock, wait this long before bumping epoch / inaugurating. */
export const T_BUFFER_MS = 1000;

/** Takeover lower bound: T_heartbeat + T_buffer. */
export const T_TAKEOVER_MS = T_HEARTBEAT_MS + T_BUFFER_MS;

/** Leader self-check interval (must be ≪ takeover delay). */
export const T_SELF_CHECK_MS = 500;

/** Web Lock name for the single Agent runtime Leader. */
export const PLAYGROUNDS_AGENT_LEADER_LOCK = "playgrounds-agent-runtime-leader";

/** Durable key for leader heartbeat / epoch (under runtime storage root). */
export const LEADER_STATE_KEY = "leader.json";
