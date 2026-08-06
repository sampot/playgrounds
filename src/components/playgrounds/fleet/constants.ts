/**
 * Agent fleet projection constants (DEC-032 / FLEET-UX-PLAN).
 */

import { MAILBOX_CAPACITY } from "../../../sam-runtime/constants.ts";

/** Snapshot default node cap. */
export const FLEET_MAX_NODES_DEFAULT = 200;

/** Isolate / ego default hop count. */
export const FLEET_EGO_HOPS_DEFAULT = 2;

/** Near-full threshold as fraction of mailbox capacity. */
export const FLEET_MAILBOX_WARN_RATIO = 0.8;

export const FLEET_MAILBOX_WARN_DEPTH = Math.floor(
  MAILBOX_CAPACITY * FLEET_MAILBOX_WARN_RATIO
);

/** Max Needs attention rows on Pulse. */
export const FLEET_ATTENTION_CAP = 50;

/** L2 default message header count. */
export const FLEET_RECENT_MSG_HEADERS = 20;
