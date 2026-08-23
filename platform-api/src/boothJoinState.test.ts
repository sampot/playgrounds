import { describe, expect, it } from "vitest";
import {
  createEmptyBoothJoinQueue,
  enqueueBoothJoin,
  storeBoothJoinAnswer,
  takeBoothJoinAnswer,
} from "./boothJoinState.js";

describe("boothJoinState", () => {
  it("activates the first join immediately", () => {
    const q = createEmptyBoothJoinQueue();
    const p = {
      joinId: "j1",
      inviteId: "inv",
      offerWire: "o1",
      createdAt: 1,
    };
    expect(enqueueBoothJoin(q, p)).toEqual(p);
    expect(q.active?.joinId).toBe("j1");
    expect(q.queue).toHaveLength(0);
  });

  it("queues subsequent joins while one is active", () => {
    const q = createEmptyBoothJoinQueue();
    enqueueBoothJoin(q, {
      joinId: "j1",
      inviteId: "inv",
      offerWire: "o1",
      createdAt: 1,
    });
    const second = {
      joinId: "j2",
      inviteId: "inv",
      offerWire: "o2",
      createdAt: 2,
    };
    expect(enqueueBoothJoin(q, second)).toBeNull();
    expect(q.queue).toEqual([second]);
  });

  it("stores answer and promotes the next queued join", () => {
    const q = createEmptyBoothJoinQueue();
    const second = {
      joinId: "j2",
      inviteId: "inv",
      offerWire: "o2",
      createdAt: 2,
    };
    enqueueBoothJoin(q, {
      joinId: "j1",
      inviteId: "inv",
      offerWire: "o1",
      createdAt: 1,
    });
    enqueueBoothJoin(q, second);
    expect(storeBoothJoinAnswer(q, "j1", "a1")).toEqual(second);
    expect(takeBoothJoinAnswer(q, "j1")).toBe("a1");
    expect(q.active?.joinId).toBe("j2");
  });
});
