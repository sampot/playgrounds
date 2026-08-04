/**
 * Session binding API version and capability tokens (DEC-023).
 */

export const SESSION_API_VERSION = "1";

/** Capability names returned by SESSION.capabilities(). */
export const SESSION_CAPABILITIES = [
  "apiVersion",
  "capabilities",
  "getSeat",
  "getState",
  "getEventChannel",
  "act",
  "leave",
] as const;

export type SessionCapability = (typeof SESSION_CAPABILITIES)[number];

/** Max concurrent Participant Agent seats (MVP). */
export const SESSION_MAX_AGENT_SEATS = 4;
