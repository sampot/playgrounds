/**
 * L1 relation projections: lineage / session / supervisor fan-out (DEC-032 Phase 3).
 */

import type { FleetAgentNode, FleetEdge } from "./types.ts";

/** Collapse hibernated sibling leaves when count ≥ this. */
export const LINEAGE_COLLAPSE_HIBERNATED_MIN = 3;

export interface LineageFlatRow {
  type: "agent" | "collapsed";
  depth: number;
  /** Present when type === "agent". */
  node?: FleetAgentNode;
  /** Present when type === "collapsed". */
  collapsedCount?: number;
  /** Parent agentId for expand/collapse key. */
  collapseKey?: string;
}

export interface SessionGroup {
  /** null = residual session_seat with no active session. */
  sessionId: string | null;
  label: string;
  stale: boolean;
  members: FleetAgentNode[];
  mailboxDepthTotal: number;
  poisonTotal: number;
}

export interface SupervisorFanout {
  hub: FleetAgentNode;
  workers: FleetAgentNode[];
  /** Old → new (succeeded by). */
  successors: { from: FleetAgentNode; to: FleetAgentNode }[];
}

export interface FocusRelations {
  parent?: FleetAgentNode;
  children: FleetAgentNode[];
  sessionPeers: FleetAgentNode[];
  /** Agents that succeed this one (replacements). */
  succeededBy: FleetAgentNode[];
  /** Agent this one succeeds (predecessor). */
  predecessor?: FleetAgentNode;
}

function byId(nodes: readonly FleetAgentNode[]): Map<string, FleetAgentNode> {
  return new Map(nodes.map(n => [n.agentId, n]));
}

/** Children map: parentAgentId → children (via clonedFrom). */
export function lineageChildrenMap(
  nodes: readonly FleetAgentNode[]
): Map<string, FleetAgentNode[]> {
  const ids = new Set(nodes.map(n => n.agentId));
  const map = new Map<string, FleetAgentNode[]>();
  for (const n of nodes) {
    const parent = n.clonedFrom;
    if (!parent || !ids.has(parent)) continue;
    const list = map.get(parent) ?? [];
    list.push(n);
    map.set(parent, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.agentId.localeCompare(b.agentId));
  }
  return map;
}

export function lineageRoots(
  nodes: readonly FleetAgentNode[]
): FleetAgentNode[] {
  const ids = new Set(nodes.map(n => n.agentId));
  return nodes
    .filter(n => !n.clonedFrom || !ids.has(n.clonedFrom))
    .sort((a, b) => a.agentId.localeCompare(b.agentId));
}

/**
 * Flatten lineage forest. Hibernated leaf siblings under the same parent
 * collapse to one row when count ≥ min (unless expandKeys contains parentId).
 */
export function flattenLineage(
  nodes: readonly FleetAgentNode[],
  opts?: {
    collapseHibernatedMin?: number;
    /** Parent agentIds whose hibernated children stay expanded. */
    expandKeys?: ReadonlySet<string>;
  }
): LineageFlatRow[] {
  const min = opts?.collapseHibernatedMin ?? LINEAGE_COLLAPSE_HIBERNATED_MIN;
  const expand = opts?.expandKeys ?? new Set<string>();
  const children = lineageChildrenMap(nodes);
  const roots = lineageRoots(nodes);
  const rows: LineageFlatRow[] = [];

  const walk = (node: FleetAgentNode, depth: number) => {
    rows.push({ type: "agent", depth, node });
    const kids = children.get(node.agentId) ?? [];
    if (kids.length === 0) return;

    const hibernatedLeaves = kids.filter(
      k =>
        k.status === "hibernated" &&
        (children.get(k.agentId) ?? []).length === 0
    );
    const rest = kids.filter(k => !hibernatedLeaves.includes(k));
    const collapse =
      hibernatedLeaves.length >= min && !expand.has(node.agentId);

    for (const k of rest) walk(k, depth + 1);

    if (collapse) {
      rows.push({
        type: "collapsed",
        depth: depth + 1,
        collapsedCount: hibernatedLeaves.length,
        collapseKey: node.agentId,
      });
    } else {
      for (const k of hibernatedLeaves) walk(k, depth + 1);
    }
  };

  for (const r of roots) walk(r, 0);
  return rows;
}

export function buildSessionGroups(
  nodes: readonly FleetAgentNode[],
  opts?: { activeSessionSeatIds?: ReadonlySet<string> }
): SessionGroup[] {
  const active = opts?.activeSessionSeatIds;
  const bySession = new Map<string, FleetAgentNode[]>();
  const residual: FleetAgentNode[] = [];

  for (const n of nodes) {
    if (n.sessionId) {
      const list = bySession.get(n.sessionId) ?? [];
      list.push(n);
      bySession.set(n.sessionId, list);
      continue;
    }
    if (n.cloneIntent === "session_seat") {
      residual.push(n);
    }
  }

  const groups: SessionGroup[] = [];
  for (const [sessionId, members] of [...bySession.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    members.sort((a, b) => a.agentId.localeCompare(b.agentId));
    const stale =
      active !== undefined && members.every(m => !active.has(m.sandboxId));
    groups.push({
      sessionId,
      label: sessionId,
      stale,
      members,
      mailboxDepthTotal: members.reduce((s, m) => s + m.mailboxDepth, 0),
      poisonTotal: members.reduce((s, m) => s + m.poisonCount, 0),
    });
  }

  if (residual.length > 0) {
    residual.sort((a, b) => a.agentId.localeCompare(b.agentId));
    groups.push({
      sessionId: null,
      label: "殘留座位（無作用中 session）",
      stale: true,
      members: residual,
      mailboxDepthTotal: residual.reduce((s, m) => s + m.mailboxDepth, 0),
      poisonTotal: residual.reduce((s, m) => s + m.poisonCount, 0),
    });
  }

  return groups;
}

/**
 * Supervisor-style fan-out hubs:
 * - active steward (if present)
 * - nodes with lineage children
 * - nodes that appear as successor edge sources/targets meaningfully
 */
export function buildSupervisorFanouts(
  nodes: readonly FleetAgentNode[],
  edges: readonly FleetEdge[],
  opts?: { stewardAgentId?: string | null }
): SupervisorFanout[] {
  const map = byId(nodes);
  const children = lineageChildrenMap(nodes);
  const hubIds = new Set<string>();

  if (opts?.stewardAgentId && map.has(opts.stewardAgentId)) {
    hubIds.add(opts.stewardAgentId);
  }
  for (const [parentId, kids] of children) {
    if (kids.length > 0) hubIds.add(parentId);
  }
  for (const n of nodes) {
    const label = n.ui?.roleLabel?.toLowerCase() ?? "";
    if (
      label.includes("supervisor") ||
      label.includes("steward") ||
      label.includes("總管")
    ) {
      hubIds.add(n.agentId);
    }
  }

  const successorPairs: { from: FleetAgentNode; to: FleetAgentNode }[] = [];
  for (const e of edges) {
    if (e.kind !== "successor") continue;
    const from = map.get(e.from);
    const to = map.get(e.to);
    if (from && to) {
      successorPairs.push({ from, to });
      hubIds.add(to.agentId);
    }
  }
  for (const n of nodes) {
    if (n.ui?.successorOf && map.has(n.ui.successorOf)) {
      const from = map.get(n.ui.successorOf)!;
      successorPairs.push({ from, to: n });
      hubIds.add(n.agentId);
    }
  }

  const fanouts: SupervisorFanout[] = [];
  for (const hubId of [...hubIds].sort()) {
    const hub = map.get(hubId);
    if (!hub) continue;
    const workers = (children.get(hubId) ?? []).slice();
    const successors = successorPairs.filter(
      p => p.to.agentId === hubId || p.from.agentId === hubId
    );
    const labeled = Boolean(hub.ui?.roleLabel);
    const isSteward = hubId === opts?.stewardAgentId;
    if (
      workers.length === 0 &&
      successors.length === 0 &&
      !isSteward &&
      !labeled
    ) {
      continue;
    }
    fanouts.push({ hub, workers, successors });
  }

  // Prefer steward first.
  fanouts.sort((a, b) => {
    if (opts?.stewardAgentId) {
      if (a.hub.agentId === opts.stewardAgentId) return -1;
      if (b.hub.agentId === opts.stewardAgentId) return 1;
    }
    return (
      b.workers.length - a.workers.length ||
      a.hub.agentId.localeCompare(b.hub.agentId)
    );
  });

  return fanouts;
}

export function focusRelations(
  agentId: string,
  nodes: readonly FleetAgentNode[],
  edges: readonly FleetEdge[] = []
): FocusRelations {
  const map = byId(nodes);
  const self = map.get(agentId);
  const children = lineageChildrenMap(nodes);
  const parent =
    self?.clonedFrom && map.has(self.clonedFrom)
      ? map.get(self.clonedFrom)
      : undefined;

  const sessionPeers = self?.sessionId
    ? nodes.filter(n => n.sessionId === self.sessionId && n.agentId !== agentId)
    : [];

  const succeededBy: FleetAgentNode[] = [];
  let predecessor: FleetAgentNode | undefined;
  for (const e of edges) {
    if (e.kind !== "successor") continue;
    if (e.from === agentId && map.has(e.to)) {
      succeededBy.push(map.get(e.to)!);
    }
    if (e.to === agentId && map.has(e.from)) {
      predecessor = map.get(e.from);
    }
  }
  for (const n of nodes) {
    if (n.ui?.successorOf === agentId) succeededBy.push(n);
    if (self?.ui?.successorOf && n.agentId === self.ui.successorOf) {
      predecessor = n;
    }
  }

  return {
    parent,
    children: children.get(agentId) ?? [],
    sessionPeers,
    succeededBy,
    predecessor,
  };
}

/** Filter nodes by shared fleet search query. */
export function filterFleetNodes(
  nodes: readonly FleetAgentNode[],
  query: string
): FleetAgentNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...nodes];
  return nodes.filter(
    n =>
      n.name.toLowerCase().includes(q) ||
      n.agentId.toLowerCase().includes(q) ||
      n.status.includes(q) ||
      (n.cloneIntent && n.cloneIntent.toLowerCase().includes(q)) ||
      (n.sessionId && n.sessionId.toLowerCase().includes(q)) ||
      (n.clonedFrom && n.clonedFrom.toLowerCase().includes(q))
  );
}
