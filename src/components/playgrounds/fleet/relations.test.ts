import { describe, expect, it } from "vitest";
import {
  buildSessionGroups,
  buildSupervisorFanouts,
  filterFleetNodes,
  flattenLineage,
  focusRelations,
  lineageRoots,
} from "./relations.ts";
import type { FleetAgentNode, FleetEdge } from "./types.ts";

function node(
  partial: Partial<FleetAgentNode> & Pick<FleetAgentNode, "agentId">
): FleetAgentNode {
  return {
    sandboxId: partial.sandboxId ?? partial.agentId,
    name: partial.name ?? partial.agentId,
    status: partial.status ?? "hibernated",
    mailboxDepth: partial.mailboxDepth ?? 0,
    inFlight: partial.inFlight ?? false,
    poisonCount: partial.poisonCount ?? 0,
    inWorkingSet: partial.inWorkingSet ?? false,
    agentManaged: partial.agentManaged ?? true,
    updatedAt: partial.updatedAt ?? 1,
    ...partial,
  };
}

describe("flattenLineage", () => {
  it("orders roots and children by depth", () => {
    const nodes = [
      node({ agentId: "root", status: "running" }),
      node({ agentId: "c1", clonedFrom: "root", status: "running" }),
      node({ agentId: "c2", clonedFrom: "root", status: "running" }),
      node({ agentId: "orphan", status: "running" }),
    ];
    const rows = flattenLineage(nodes, { collapseHibernatedMin: 99 });
    expect(lineageRoots(nodes).map(n => n.agentId)).toEqual(["orphan", "root"]);
    const depths = Object.fromEntries(
      rows.filter(r => r.type === "agent").map(r => [r.node!.agentId, r.depth])
    );
    expect(depths.root).toBe(0);
    expect(depths.c1).toBe(1);
    expect(depths.c2).toBe(1);
    expect(depths.orphan).toBe(0);
  });

  it("collapses hibernated leaf siblings", () => {
    const nodes = [
      node({ agentId: "root", status: "running" }),
      node({ agentId: "h1", clonedFrom: "root", status: "hibernated" }),
      node({ agentId: "h2", clonedFrom: "root", status: "hibernated" }),
      node({ agentId: "h3", clonedFrom: "root", status: "hibernated" }),
      node({ agentId: "alive", clonedFrom: "root", status: "running" }),
    ];
    const rows = flattenLineage(nodes, { collapseHibernatedMin: 3 });
    expect(
      rows.some(r => r.type === "collapsed" && r.collapsedCount === 3)
    ).toBe(true);
    expect(rows.some(r => r.node?.agentId === "alive")).toBe(true);
    expect(rows.some(r => r.node?.agentId === "h1")).toBe(false);

    const expanded = flattenLineage(nodes, {
      collapseHibernatedMin: 3,
      expandKeys: new Set(["root"]),
    });
    expect(expanded.some(r => r.node?.agentId === "h1")).toBe(true);
    expect(expanded.some(r => r.type === "collapsed")).toBe(false);
  });
});

describe("buildSessionGroups", () => {
  it("groups by sessionId and residual seats", () => {
    const nodes = [
      node({
        agentId: "a",
        sessionId: "sess-1",
        status: "running",
        mailboxDepth: 2,
      }),
      node({
        agentId: "b",
        sessionId: "sess-1",
        status: "running",
        poisonCount: 1,
      }),
      node({
        agentId: "old",
        cloneIntent: "session_seat",
        status: "hibernated",
      }),
    ];
    const groups = buildSessionGroups(nodes, {
      activeSessionSeatIds: new Set(["a"]),
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.sessionId).toBe("sess-1");
    expect(groups[0]?.stale).toBe(false);
    expect(groups[0]?.poisonTotal).toBe(1);
    expect(groups[0]?.mailboxDepthTotal).toBe(2);
    expect(groups[1]?.sessionId).toBeNull();
    expect(groups[1]?.stale).toBe(true);
    expect(groups[1]?.members.map(m => m.agentId)).toEqual(["old"]);
  });

  it("marks session stale when no seats active", () => {
    const nodes = [
      node({ agentId: "a", sessionId: "s", cloneIntent: "session_seat" }),
    ];
    const groups = buildSessionGroups(nodes, {
      activeSessionSeatIds: new Set(),
    });
    expect(groups[0]?.stale).toBe(true);
  });
});

describe("buildSupervisorFanouts", () => {
  it("puts steward first with lineage workers", () => {
    const nodes = [
      node({ agentId: "steward", status: "running" }),
      node({
        agentId: "w1",
        clonedFrom: "steward",
        cloneIntent: "self_upgrade",
        status: "hibernated",
      }),
      node({
        agentId: "w2",
        clonedFrom: "steward",
        status: "running",
      }),
    ];
    const fanouts = buildSupervisorFanouts(nodes, [], {
      stewardAgentId: "steward",
    });
    expect(fanouts[0]?.hub.agentId).toBe("steward");
    expect(fanouts[0]?.workers.map(w => w.agentId)).toEqual(["w1", "w2"]);
  });

  it("includes successor edges", () => {
    const nodes = [
      node({ agentId: "old", status: "stopped" }),
      node({
        agentId: "new",
        status: "running",
        ui: { successorOf: "old" },
      }),
    ];
    const edges: FleetEdge[] = [{ from: "old", to: "new", kind: "successor" }];
    const fanouts = buildSupervisorFanouts(nodes, edges);
    expect(fanouts.some(f => f.hub.agentId === "new")).toBe(true);
    const withSucc = fanouts.find(f => f.successors.length > 0);
    expect(withSucc?.successors[0]?.from.agentId).toBe("old");
    expect(withSucc?.successors[0]?.to.agentId).toBe("new");
  });
});

describe("focusRelations", () => {
  it("returns parent, children, peers", () => {
    const nodes = [
      node({ agentId: "p" }),
      node({ agentId: "c", clonedFrom: "p", sessionId: "s" }),
      node({ agentId: "peer", sessionId: "s" }),
    ];
    const rel = focusRelations("c", nodes);
    expect(rel.parent?.agentId).toBe("p");
    expect(rel.children).toHaveLength(0);
    expect(rel.sessionPeers.map(n => n.agentId)).toEqual(["peer"]);
  });
});

describe("filterFleetNodes", () => {
  it("matches intent and session", () => {
    const nodes = [
      node({ agentId: "a", cloneIntent: "self_upgrade" }),
      node({ agentId: "b", sessionId: "sess-xyz" }),
    ];
    expect(filterFleetNodes(nodes, "self_up").map(n => n.agentId)).toEqual([
      "a",
    ]);
    expect(filterFleetNodes(nodes, "sess-x").map(n => n.agentId)).toEqual([
      "b",
    ]);
  });
});
