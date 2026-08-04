/**
 * Agent mailbox message envelope (DEC-031 §6.2).
 */

export type AgentMessageFrom = string; // agentId | "system" | "user" | "host"

export interface AgentMessage {
  id: string;
  from: AgentMessageFrom;
  to: string;
  type: string;
  payload: unknown;
  replyTo?: string;
  sentAt: number;
  deliveryAttempts: number;
}

export function newMessageId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createAgentMessage(input: {
  id?: string;
  from: AgentMessageFrom;
  to: string;
  type: string;
  payload?: unknown;
  replyTo?: string;
  sentAt?: number;
}): AgentMessage {
  return {
    id: input.id ?? newMessageId(),
    from: input.from,
    to: input.to,
    type: input.type,
    payload: input.payload ?? null,
    replyTo: input.replyTo,
    sentAt: input.sentAt ?? Date.now(),
    deliveryAttempts: 0,
  };
}
