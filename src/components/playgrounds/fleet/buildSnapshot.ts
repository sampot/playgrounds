/**
 * Pure FleetSnapshot assembly (DEC-032).
 */

import { buildAttention, countByStatus, sumPressure } from "./attention.ts";
import {
  FLEET_ATTENTION_CAP,
  FLEET_EGO_HOPS_DEFAULT,
  FLEET_MAILBOX_WARN_DEPTH,
  FLEET_MAX_NODES_DEFAULT,
} from "./constants.ts";
import { filterEdgesByKind, trimToEgo, trimToMaxNodes } from "./graph.ts";
import type { FleetBuildInput, FleetEdge, FleetSnapshot } from "./types.ts";

/**
 * Assemble snapshot from pre-merged nodes/edges.
 * Pulse aggregates (counts／pressure／attention) use the full node set;
 * `nodes`／`edges` are ego／maxNodes trimmed for rendering.
 */
export function buildFleetSnapshot(input: FleetBuildInput): FleetSnapshot {
  const opts = input.opts ?? {};
  const warnDepth = input.mailboxWarnDepth ?? FLEET_MAILBOX_WARN_DEPTH;
  const attentionCap = input.attentionCap ?? FLEET_ATTENTION_CAP;
  const maxNodes = opts.maxNodes ?? FLEET_MAX_NODES_DEFAULT;

  const allNodes = input.nodes.map(n => ({ ...n }));
  let edges: FleetEdge[] = filterEdgesByKind(
    input.edges,
    opts.edgeKinds ??
      (opts.includeTraffic
        ? ["lineage", "session", "successor", "traffic"]
        : ["lineage", "session", "successor"])
  );

  const attention = buildAttention(allNodes, {
    activeSessionSeatIds: input.activeSessionSeatIds,
    mailboxWarnDepth: warnDepth,
    attentionCap,
  });

  let viewNodes = allNodes;
  let viewEdges = edges;

  if (opts.egoAgentId) {
    const ego = trimToEgo(
      viewNodes,
      viewEdges,
      opts.egoAgentId,
      opts.egoHops ?? FLEET_EGO_HOPS_DEFAULT
    );
    viewNodes = ego.nodes;
    viewEdges = ego.edges;
  }

  const trimmed = trimToMaxNodes(viewNodes, viewEdges, {
    maxNodes,
    attention,
    retainAgentId: opts.egoAgentId,
  });

  return {
    leader: { ...input.leader },
    counts: countByStatus(allNodes),
    pressure: sumPressure(allNodes, warnDepth),
    attention,
    nodes: trimmed.nodes,
    edges: trimmed.edges,
    generatedAt: input.now ?? Date.now(),
  };
}
