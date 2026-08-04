/**
 * Shell loader: merge registry + mailbox + project meta + session → FleetSnapshot.
 */

import type { MailboxSummary } from "../../../sam-runtime/index.ts";
import { getAgentRuntimeHub } from "../agentRuntimeHub";
import type { ProjectMeta } from "../projectTypes";
import { isInWorkingSet } from "../workingSet";
import { buildFleetSnapshot } from "./buildSnapshot.ts";
import type {
  AgentUiAnnotation,
  FleetAgentNode,
  FleetEdge,
  FleetNodeStatus,
  FleetSnapshot,
  FleetSnapshotOpts,
} from "./types.ts";

export interface LoadFleetSnapshotArgs {
  projects: readonly ProjectMeta[];
  /** Active session seat sandboxIds (open or paused). */
  activeSessionSeatIds?: ReadonlySet<string>;
  /** sessionId for seats currently joined (sandboxId → sessionId). */
  sessionIdBySandbox?: ReadonlyMap<string, string>;
  opts?: FleetSnapshotOpts;
}

/** HOST / tool-safe summary — no message payloads. */
export interface FleetSummaryAgent {
  agentId: string;
  sandboxId: string;
  name: string;
  status: FleetNodeStatus;
  mailboxDepth: number;
  poisonCount: number;
  inFlight: boolean;
  inWorkingSet: boolean;
  agentManaged: boolean;
  clonedFrom?: string;
  cloneIntent?: string;
  roleLabel?: string;
  health?: AgentUiAnnotation["health"];
  healthDetail?: string;
}

export interface FleetSummary {
  leader: { isLeader: boolean; epoch: number };
  counts: FleetSnapshot["counts"];
  pressure: FleetSnapshot["pressure"];
  attention: FleetSnapshot["attention"];
  agents: FleetSummaryAgent[];
  /** Present only when includeTraffic was requested. */
  traffic?: { from: string; to: string; weight: number }[];
  generatedAt: number;
}

function asFleetStatus(status: string): FleetNodeStatus {
  switch (status) {
    case "running":
    case "hibernated":
    case "stopped":
    case "registered":
      return status;
    default:
      return "registered";
  }
}

function lineageEdges(nodes: readonly FleetAgentNode[]): FleetEdge[] {
  const ids = new Set(nodes.map(n => n.agentId));
  const edges: FleetEdge[] = [];
  for (const n of nodes) {
    if (n.clonedFrom && ids.has(n.clonedFrom)) {
      edges.push({
        from: n.clonedFrom,
        to: n.agentId,
        kind: "lineage",
      });
    }
    if (n.ui?.successorOf && ids.has(n.ui.successorOf)) {
      edges.push({
        from: n.ui.successorOf,
        to: n.agentId,
        kind: "successor",
      });
    }
  }
  return edges;
}

function sessionEdges(
  nodes: readonly FleetAgentNode[],
  sessionIdBySandbox: ReadonlyMap<string, string> | undefined
): FleetEdge[] {
  if (!sessionIdBySandbox || sessionIdBySandbox.size === 0) return [];
  const bySession = new Map<string, string[]>();
  for (const n of nodes) {
    const sid = sessionIdBySandbox.get(n.sandboxId) ?? n.sessionId;
    if (!sid) continue;
    const list = bySession.get(sid) ?? [];
    list.push(n.agentId);
    bySession.set(sid, list);
  }
  const edges: FleetEdge[] = [];
  for (const members of bySession.values()) {
    if (members.length < 2) continue;
    const sorted = [...members].sort();
    const hub = sorted[0]!;
    for (let i = 1; i < sorted.length; i++) {
      edges.push({ from: hub, to: sorted[i]!, kind: "session" });
    }
  }
  return edges;
}

/**
 * Load fleet projection from the Agent runtime hub + sandbox inventory.
 */
export async function loadFleetSnapshot(
  args: LoadFleetSnapshotArgs
): Promise<FleetSnapshot> {
  const hub = await getAgentRuntimeHub();
  const status = hub.getStatus();
  const registry = await hub.runtime.registry.list();
  const projectById = new Map(args.projects.map(p => [p.id, p]));
  let uiById: Record<string, AgentUiAnnotation> = {};
  try {
    uiById = await hub.agentUi.list();
  } catch {
    uiById = {};
  }

  const nodes: FleetAgentNode[] = [];
  for (const entry of registry) {
    let summary: MailboxSummary;
    try {
      summary = await hub.runtime.mailbox.summarize(entry.agentId);
    } catch {
      summary = { depth: 0, inFlight: false, poisonCount: 0 };
    }
    let alarmPendingCount = 0;
    try {
      const alarms = await hub.runtime.alarms.listForAgent(entry.agentId);
      alarmPendingCount = alarms.length;
    } catch {
      alarmPendingCount = 0;
    }
    const meta = projectById.get(entry.sandboxId);
    const sessionId = args.sessionIdBySandbox?.get(entry.sandboxId);
    nodes.push({
      agentId: entry.agentId,
      sandboxId: entry.sandboxId,
      name: entry.name ?? meta?.name ?? entry.agentId,
      status: asFleetStatus(entry.status),
      mailboxDepth: summary.depth,
      inFlight: summary.inFlight,
      poisonCount: summary.poisonCount,
      alarmPendingCount,
      inWorkingSet: meta ? isInWorkingSet(meta) : false,
      agentManaged: meta?.agentManaged === true,
      clonedFrom: meta?.clonedFrom,
      cloneIntent: meta?.cloneIntent,
      sessionId,
      ui: uiById[entry.agentId],
      updatedAt: entry.updatedAt,
    });
  }

  const edges: FleetEdge[] = [
    ...lineageEdges(nodes),
    ...sessionEdges(nodes, args.sessionIdBySandbox),
  ];

  if (args.opts?.includeTraffic) {
    try {
      const traffic = await hub.traffic.toEdges();
      const ids = new Set(nodes.map(n => n.agentId));
      for (const e of traffic) {
        if (ids.has(e.from) && ids.has(e.to)) edges.push(e);
      }
    } catch {
      /* ignore traffic read failures */
    }
  }

  return buildFleetSnapshot({
    leader: {
      isLeader: status.role === "leader" || status.role === "solo",
      epoch: status.epoch,
    },
    nodes,
    edges,
    activeSessionSeatIds: args.activeSessionSeatIds,
    opts: args.opts,
  });
}

/** Strip snapshot to HOST-safe summary (no payloads, optional traffic pairs). */
export function toFleetSummary(
  snap: FleetSnapshot,
  opts?: { includeTraffic?: boolean }
): FleetSummary {
  const agents: FleetSummaryAgent[] = snap.nodes.map(n => ({
    agentId: n.agentId,
    sandboxId: n.sandboxId,
    name: n.name,
    status: n.status,
    mailboxDepth: n.mailboxDepth,
    poisonCount: n.poisonCount,
    inFlight: n.inFlight,
    inWorkingSet: n.inWorkingSet,
    agentManaged: n.agentManaged,
    clonedFrom: n.clonedFrom,
    cloneIntent: n.cloneIntent,
    roleLabel: n.ui?.roleLabel,
    health: n.ui?.health,
    healthDetail: n.ui?.healthDetail,
  }));
  const out: FleetSummary = {
    leader: snap.leader,
    counts: snap.counts,
    pressure: snap.pressure,
    attention: snap.attention,
    agents,
    generatedAt: snap.generatedAt,
  };
  if (opts?.includeTraffic) {
    out.traffic = snap.edges
      .filter(e => e.kind === "traffic")
      .map(e => ({
        from: e.from,
        to: e.to,
        weight: e.weight ?? 1,
      }));
  }
  return out;
}
