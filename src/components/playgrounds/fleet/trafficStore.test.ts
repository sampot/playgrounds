import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../../../sam-runtime/storage.ts";
import { TrafficStore } from "./trafficStore.ts";

describe("TrafficStore", () => {
  it("aggregates directed pairs and projects edges", async () => {
    const store = new TrafficStore(createMemoryStorage());
    const t0 = 1_000_000;
    await store.record({ from: "a", to: "b", at: t0 });
    await store.record({ from: "a", to: "b", at: t0 + 1 });
    await store.record({ from: "b", to: "c", at: t0 + 2 });
    const pairs = await store.list({ now: t0 + 3, windowMs: 60_000 });
    expect(pairs[0]).toMatchObject({ from: "a", to: "b", count: 2 });
    const edges = await store.toEdges({ now: t0 + 3, windowMs: 60_000 });
    expect(edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "a",
          to: "b",
          kind: "traffic",
          weight: 2,
        }),
      ])
    );
  });

  it("drops pairs outside the window", async () => {
    const store = new TrafficStore(createMemoryStorage());
    await store.record({ from: "a", to: "b", at: 100 });
    const pairs = await store.list({
      now: 100 + 20 * 60 * 1000,
      windowMs: 1000,
    });
    expect(pairs).toHaveLength(0);
  });
});
