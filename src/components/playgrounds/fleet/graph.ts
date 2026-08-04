/**
 * Fleet graph trim: ego neighborhood + maxNodes (DEC-032).
 */

import {
  FLEET_EGO_HOPS_DEFAULT,
  FLEET_MAX_NODES_DEFAULT,
} from "./constants.ts";
import type {
  FleetAgentNode,
  FleetAttentionItem,
  FleetEdge,
  FleetEdgeKind,
} from "./types.ts";

export function filterEdgesByKind(
  edges: readonly FleetEdge[],
  kinds: readonly FleetEdgeKind[] | undefined
): FleetEdge[] {
  if (!kinds || kinds.length === 0) return edges.map(e => ({ ...e }));
  const allow = new Set(kinds);
  return edges.filter(e => allow.has(e.kind)).map(e => ({ ...e }));
}

/** Undirected adjacency for ego BFS. */
function buildAdj(edges: readonly FleetEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    let s = adj.get(a);
    if (!s) {
      s = new Set();
      adj.set(a, s);
    }
    s.add(b);
  };
  for (const e of edges) {
    add(e.from, e.to);
    add(e.to, e.from);
  }
  return adj;
}

/**
 * Keep ego + nodes within `hops` (undirected). Edges restricted to kept nodes.
 */
export function trimToEgo(
  nodes: readonly FleetAgentNode[],
  edges: readonly FleetEdge[],
  egoAgentId: string,
  hops = FLEET_EGO_HOPS_DEFAULT
): { nodes: FleetAgentNode[]; edges: FleetEdge[] } {
  const byId = new Map(nodes.map(n => [n.agentId, n]));
  if (!byId.has(egoAgentId)) {
    return { nodes: [], edges: [] };
  }
  const adj = buildAdj(edges);
  const kept = new Set<string>([egoAgentId]);
  let frontier = [egoAgentId];
  for (let h = 0; h < hops; h++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (kept.has(nb)) continue;
        if (!byId.has(nb)) continue;
        kept.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
    if (frontier.length === 0) break;
  }
  const outNodes = nodes.filter(n => kept.has(n.agentId));
  const outEdges = edges.filter(e => kept.has(e.from) && kept.has(e.to));
  return { nodes: outNodes, edges: outEdges };
}

/**
 * Cap node count. Prefer: attention → running → deeper mailbox → id.
 * Always retain ego when provided.
 */
export function trimToMaxNodes(
  nodes: readonly FleetAgentNode[],
  edges: readonly FleetEdge[],
  opts?: {
    maxNodes?: number;
    attention?: readonly FleetAttentionItem[];
    retainAgentId?: string;
  }
): { nodes: FleetAgentNode[]; edges: FleetEdge[] } {
  const max = opts?.maxNodes ?? FLEET_MAX_NODES_DEFAULT;
  if (nodes.length <= max) {
    return {
      nodes: nodes.map(n => ({ ...n })),
      edges: edges.map(e => ({ ...e })),
    };
  }

  const attentionRank = new Map<string, number>();
  (opts?.attention ?? []).forEach((a, i) => {
    if (!attentionRank.has(a.agentId)) attentionRank.set(a.agentId, i);
  });

  const statusRank: Record<FleetAgentNode["status"], number> = {
    running: 0,
    registered: 1,
    hibernated: 2,
    stopped: 3,
  };

  const sorted = [...nodes].sort((a, b) => {
    if (opts?.retainAgentId) {
      if (a.agentId === opts.retainAgentId) return -1;
      if (b.agentId === opts.retainAgentId) return 1;
    }
    const aa = attentionRank.has(a.agentId)
      ? attentionRank.get(a.agentId)!
      : 9999;
    const ba = attentionRank.has(b.agentId)
      ? attentionRank.get(b.agentId)!
      : 9999;
    if (aa !== ba) return aa - ba;
    const sr = statusRank[a.status] - statusRank[b.status];
    if (sr !== 0) return sr;
    if (b.mailboxDepth !== a.mailboxDepth) {
      return b.mailboxDepth - a.mailboxDepth;
    }
    if (b.poisonCount !== a.poisonCount) {
      return b.poisonCount - a.poisonCount;
    }
    return a.agentId.localeCompare(b.agentId);
  });

  const kept = new Set(sorted.slice(0, max).map(n => n.agentId));
  if (opts?.retainAgentId) kept.add(opts.retainAgentId);

  return {
    nodes: nodes.filter(n => kept.has(n.agentId)),
    edges: edges.filter(e => kept.has(e.from) && kept.has(e.to)),
  };
}
