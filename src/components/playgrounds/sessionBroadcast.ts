/**
 * BroadcastChannel helpers for multi-agent session events (DEC-023).
 */

import type { SessionEventEnvelope } from "./sessionTypes";

export function sessionChannelName(sessionId: string): string {
  return `playgrounds-session:${sessionId}`;
}

export type BroadcastChannelFactory = (name: string) => BroadcastChannel;

let channelFactory: BroadcastChannelFactory = name =>
  new BroadcastChannel(name);

/** Test hook to inject a mock BroadcastChannel. */
export function setBroadcastChannelFactory(
  factory: BroadcastChannelFactory | null
): void {
  channelFactory = factory ?? (name => new BroadcastChannel(name));
}

export function createSessionBroadcastChannel(
  sessionId: string
): BroadcastChannel {
  return channelFactory(sessionChannelName(sessionId));
}

export function publishSessionEvent(
  channel: BroadcastChannel,
  envelope: SessionEventEnvelope
): void {
  channel.postMessage(envelope);
}

export function isSessionEventEnvelope(
  data: unknown
): data is SessionEventEnvelope {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  return (
    o.type === "session-event" &&
    typeof o.sessionId === "string" &&
    typeof o.seq === "number"
  );
}
