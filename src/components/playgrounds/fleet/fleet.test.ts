import { describe, expect, it } from "vitest";
import { buildAttention, countByStatus, sumPressure } from "./attention.ts";
import { buildFleetSnapshot } from "./buildSnapshot.ts";
import { FLEET_MAILBOX_WARN_DEPTH } from "./constants.ts";
import { trimToEgo, trimToMaxNodes } from "./graph.ts";
import { toFleetGraphData } from "./graphData.ts";
import { toFleetSummary } from "./loadFleetSnapshot.ts";
import type { FleetAgentNode, FleetEdge, FleetSnapshot } from "./types.ts";

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

describe("buildAttention", () => {
  it("ranks poison before mailbox pressure", () => {
    const items = buildAttention(
      [
        node({ agentId: "b", mailboxDepth: FLEET_MAILBOX_WARN_DEPTH }),
        node({ agentId: "a", poisonCount: 2 }),
      ],
      { mailboxWarnDepth: FLEET_MAILBOX_WARN_DEPTH }
    );
    expect(items[0]?.reason).toBe("poison");
    expect(items[0]?.agentId).toBe("a");
    expect(items.some(i => i.reason === "mailbox_pressure")).toBe(true);
  });

  it("does not treat hibernated alone as a fault", () => {
    const items = buildAttention([
      node({ agentId: "h", status: "hibernated" }),
    ]);
    expect(items).toHaveLength(0);
  });

  it("flags stale session_seat when not in active seats", () => {
    const items = buildAttention(
      [
        node({
          agentId: "seat-1",
          cloneIntent: "session_seat",
          status: "hibernated",
        }),
      ],
      { activeSessionSeatIds: new Set() }
    );
    expect(items.some(i => i.reason === "stale_session_seat")).toBe(true);
  });

  it("skips stale_session_seat when seat is active", () => {
    const items = buildAttention(
      [
        node({
          agentId: "seat-1",
          sandboxId: "seat-1",
          cloneIntent: "session_seat",
        }),
      ],
      { activeSessionSeatIds: new Set(["seat-1"]) }
    );
    expect(items.some(i => i.reason === "stale_session_seat")).toBe(false);
  });
});

describe("countByStatus / sumPressure", () => {
  it("counts hibernated separately from running", () => {
    const counts = countByStatus([
      node({ agentId: "a", status: "running" }),
      node({ agentId: "b", status: "hibernated" }),
      node({ agentId: "c", status: "hibernated" }),
    ]);
    expect(counts.running).toBe(1);
    expect(counts.hibernated).toBe(2);
  });

  it("sums mailbox depth and poison", () => {
    const p = sumPressure(
      [
        node({ agentId: "a", mailboxDepth: 10, poisonCount: 1 }),
        node({
          agentId: "b",
          mailboxDepth: FLEET_MAILBOX_WARN_DEPTH,
          poisonCount: 2,
        }),
      ],
      FLEET_MAILBOX_WARN_DEPTH
    );
    expect(p.mailboxDepthTotal).toBe(10 + FLEET_MAILBOX_WARN_DEPTH);
    expect(p.nearFullCount).toBe(1);
    expect(p.poisonTotal).toBe(3);
  });
});

describe("trimToEgo", () => {
  const nodes = [
    node({ agentId: "root" }),
    node({ agentId: "child", clonedFrom: "root" }),
    node({ agentId: "grand", clonedFrom: "child" }),
    node({ agentId: "other" }),
  ];
  const edges: FleetEdge[] = [
    { from: "root", to: "child", kind: "lineage" },
    { from: "child", to: "grand", kind: "lineage" },
  ];

  it("keeps ego ± hops", () => {
    const one = trimToEgo(nodes, edges, "child", 1);
    expect(one.nodes.map(n => n.agentId).sort()).toEqual([
      "child",
      "grand",
      "root",
    ]);
    const zero = trimToEgo(nodes, edges, "child", 0);
    expect(zero.nodes.map(n => n.agentId)).toEqual(["child"]);
  });

  it("returns empty when ego missing", () => {
    const r = trimToEgo(nodes, edges, "nope", 2);
    expect(r.nodes).toHaveLength(0);
  });
});

describe("trimToMaxNodes", () => {
  it("prefers attention then running", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      node({
        agentId: `n${i}`,
        status: i === 3 ? "running" : "hibernated",
        mailboxDepth: i,
      })
    );
    const { nodes: kept } = trimToMaxNodes(nodes, [], {
      maxNodes: 2,
      attention: [
        {
          agentId: "n1",
          reason: "poison",
          severity: "error",
        },
      ],
    });
    expect(kept.map(n => n.agentId)).toEqual(["n1", "n3"]);
  });

  it("retains ego even if low priority", () => {
    const nodes = [
      node({ agentId: "ego", status: "stopped" }),
      node({ agentId: "hot", status: "running", mailboxDepth: 99 }),
      node({ agentId: "hot2", status: "running", mailboxDepth: 98 }),
    ];
    const { nodes: kept } = trimToMaxNodes(nodes, [], {
      maxNodes: 2,
      retainAgentId: "ego",
    });
    expect(kept.some(n => n.agentId === "ego")).toBe(true);
    expect(kept).toHaveLength(2);
  });
});

describe("toFleetSummary", () => {
  it("omits payloads and optionally includes traffic pairs", () => {
    const snap: FleetSnapshot = {
      leader: { isLeader: true, epoch: 1 },
      counts: { registered: 0, running: 1, hibernated: 0, stopped: 0 },
      pressure: { mailboxDepthTotal: 2, nearFullCount: 0, poisonTotal: 0 },
      attention: [],
      nodes: [
        node({
          agentId: "a",
          status: "running",
          mailboxDepth: 2,
          ui: { roleLabel: "hub", health: "ok" },
        }),
      ],
      edges: [
        { from: "a", to: "a", kind: "traffic", weight: 3 },
        { from: "a", to: "a", kind: "lineage" },
      ],
      generatedAt: 9,
    };
    const base = toFleetSummary(snap);
    expect(base.agents[0]?.roleLabel).toBe("hub");
    expect(base.traffic).toBeUndefined();
    const withT = toFleetSummary(snap, { includeTraffic: true });
    expect(withT.traffic).toEqual([{ from: "a", to: "a", weight: 3 }]);
  });
});

describe("toFleetGraphData", () => {
  it("filters edge kinds and drops dangling links", () => {
    const nodes = [node({ agentId: "a" }), node({ agentId: "b" })];
    const edges: FleetEdge[] = [
      { from: "a", to: "b", kind: "lineage" },
      { from: "a", to: "b", kind: "session" },
      { from: "a", to: "missing", kind: "lineage" },
    ];
    const data = toFleetGraphData(nodes, edges, ["lineage"]);
    expect(data.nodes).toHaveLength(2);
    expect(data.links).toHaveLength(1);
    expect(data.links[0]?.kind).toBe("lineage");
  });
});

describe("buildFleetSnapshot", () => {
  it("Pulse aggregates use full set; nodes respect maxNodes", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      node({
        agentId: `a${i}`,
        status: "running",
        poisonCount: i === 4 ? 1 : 0,
      })
    );
    const snap = buildFleetSnapshot({
      leader: { isLeader: true, epoch: 2 },
      nodes,
      edges: [],
      opts: { maxNodes: 2 },
      now: 1000,
    });
    expect(snap.counts.running).toBe(5);
    expect(snap.pressure.poisonTotal).toBe(1);
    expect(snap.attention.some(a => a.agentId === "a4")).toBe(true);
    expect(snap.nodes.length).toBe(2);
    expect(snap.leader.epoch).toBe(2);
    expect(snap.generatedAt).toBe(1000);
  });

  it("ego trims view edges", () => {
    const nodes = [
      node({ agentId: "a" }),
      node({ agentId: "b", clonedFrom: "a" }),
      node({ agentId: "c" }),
    ];
    const edges: FleetEdge[] = [{ from: "a", to: "b", kind: "lineage" }];
    const snap = buildFleetSnapshot({
      leader: { isLeader: false, epoch: 0 },
      nodes,
      edges,
      opts: { egoAgentId: "a", egoHops: 1, maxNodes: 200 },
    });
    expect(snap.counts.hibernated).toBe(3);
    expect(snap.nodes.map(n => n.agentId).sort()).toEqual(["a", "b"]);
    expect(snap.edges).toHaveLength(1);
  });
});
