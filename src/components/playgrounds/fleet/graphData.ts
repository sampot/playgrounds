/**
 * Convert fleet projection → 3d-force-graph data (DEC-032 Phase 4).
 */

import type { FleetAgentNode, FleetEdge, FleetEdgeKind } from "./types.ts";

export interface FleetGraphNode {
  id: string;
  name: string;
  status: FleetAgentNode["status"];
  mailboxDepth: number;
  poisonCount: number;
  cloneIntent?: string;
  val: number;
}

export interface FleetGraphLink {
  source: string;
  target: string;
  kind: FleetEdgeKind;
}

export interface FleetGraphData {
  nodes: FleetGraphNode[];
  links: FleetGraphLink[];
}

export function toFleetGraphData(
  nodes: readonly FleetAgentNode[],
  edges: readonly FleetEdge[],
  edgeKinds?: readonly FleetEdgeKind[]
): FleetGraphData {
  const allow = edgeKinds ? new Set(edgeKinds) : null;
  const ids = new Set(nodes.map(n => n.agentId));
  return {
    nodes: nodes.map(n => ({
      id: n.agentId,
      name: n.name,
      status: n.status,
      mailboxDepth: n.mailboxDepth,
      poisonCount: n.poisonCount,
      cloneIntent: n.cloneIntent,
      val: Math.max(1, 1 + n.mailboxDepth * 0.05 + n.poisonCount),
    })),
    links: edges
      .filter(e => ids.has(e.from) && ids.has(e.to))
      .filter(e => !allow || allow.has(e.kind))
      .map(e => ({
        source: e.from,
        target: e.to,
        kind: e.kind,
      })),
  };
}

export function nodeColorForStatus(status: FleetAgentNode["status"]): string {
  switch (status) {
    case "running":
      return "#2f6fed";
    case "hibernated":
      return "#8a9199";
    case "stopped":
      return "#c45c26";
    default:
      return "#5c6570";
  }
}

export function linkColorForKind(kind: FleetEdgeKind): string {
  switch (kind) {
    case "lineage":
      return "rgba(80,90,100,0.55)";
    case "session":
      return "rgba(47,111,237,0.55)";
    case "successor":
      return "rgba(196,92,38,0.7)";
    case "traffic":
      return "rgba(120,160,80,0.45)";
    default:
      return "rgba(100,100,100,0.4)";
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
