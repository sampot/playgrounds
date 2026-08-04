/**
 * Machine-readable Agent runtime errors (DEC-031).
 */

export type AgentRuntimeErrorCode =
  | "agent_not_found"
  | "mailbox_full"
  | "not_leader"
  | "leader_epoch_mismatch"
  | "mailbox_poisoned"
  | "instance_not_started"
  | "controller_no_onCommand"
  | "controller_no_onMessage";

export class AgentRuntimeError extends Error {
  readonly code: AgentRuntimeErrorCode;

  constructor(code: AgentRuntimeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "AgentRuntimeError";
    this.code = code;
  }
}
