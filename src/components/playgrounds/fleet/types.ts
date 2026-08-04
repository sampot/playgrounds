/**
 * Agent fleet projection types (DEC-032).
 */

export type FleetNodeStatus =
  "registered" | "running" | "hibernated" | "stopped";

export type FleetEdgeKind = "lineage" | "session" | "successor" | "traffic";

export interface AgentUiAnnotation {
  roleLabel?: string;
  groupId?: string;
  health?: "ok" | "warn" | "error";
  healthDetail?: string;
  successorOf?: string;
}

export interface FleetAgentNode {
  agentId: string;
  sandboxId: string;
  name: string;
  status: FleetNodeStatus;
  mailboxDepth: number;
  inFlight: boolean;
  poisonCount: number;
  alarmPendingCount?: number;
  inWorkingSet: boolean;
  agentManaged: boolean;
  clonedFrom?: string;
  cloneIntent?: string;
  sessionId?: string;
  ui?: AgentUiAnnotation;
  updatedAt: number;
}

export interface FleetEdge {
  from: string;
  to: string;
  kind: FleetEdgeKind;
  weight?: number;
}

export type FleetAttentionReason =
  | "poison"
  | "mailbox_pressure"
  | "orphan"
  | "stale_session_seat"
  | "stuck"
  | "app_health";

export interface FleetAttentionItem {
  agentId: string;
  reason: FleetAttentionReason;
  severity: "warn" | "error";
  detail?: string;
}

export interface FleetSnapshot {
  leader: { isLeader: boolean; epoch: number };
  counts: Record<FleetNodeStatus, number>;
  pressure: {
    mailboxDepthTotal: number;
    nearFullCount: number;
    poisonTotal: number;
  };
  attention: FleetAttentionItem[];
  nodes: FleetAgentNode[];
  edges: FleetEdge[];
  generatedAt: number;
}

export interface FleetSnapshotOpts {
  egoAgentId?: string;
  egoHops?: number;
  maxNodes?: number;
  edgeKinds?: FleetEdgeKind[];
  includeTraffic?: boolean;
}

/** Inputs assembled before pure build (testable without OPFS). */
export interface FleetBuildInput {
  leader: { isLeader: boolean; epoch: number };
  nodes: FleetAgentNode[];
  edges: FleetEdge[];
  /** Seat sandboxIds currently in an open/paused session. */
  activeSessionSeatIds?: ReadonlySet<string>;
  opts?: FleetSnapshotOpts;
  now?: number;
  mailboxWarnDepth?: number;
  attentionCap?: number;
}
