import { afterEach, describe, expect, it } from "vitest";
import {
  fanoutSessionEventsToMailboxes,
  setSessionMailboxFanout,
} from "./sessionMailboxFanout";
import { SessionRuntime } from "./sessionRuntime";
import { setBroadcastChannelFactory } from "./sessionBroadcast";

describe("sessionMailboxFanout", () => {
  afterEach(() => {
    setSessionMailboxFanout(null);
    setBroadcastChannelFactory(null);
  });

  it("publishEvents fans out to agent seats", async () => {
    const received: { agentId: string; seq: number }[] = [];
    setSessionMailboxFanout(items => {
      for (const i of items) {
        received.push({ agentId: i.agentId, seq: i.seq });
      }
    });
    setBroadcastChannelFactory(() => {
      return {
        name: "mock",
        postMessage() {},
        close() {},
        onmessage: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {
          return false;
        },
      } as unknown as BroadcastChannel;
    });

    const rt = new SessionRuntime();
    rt.open("host-1", {
      protocolId: "test.v1",
      apiVersion: "1",
      roles: ["human", "participant"],
    });
    rt.joinAgent({
      sandboxId: "agent-a",
      role: "participant",
      protocolId: "test.v1",
      apiVersion: "1",
    });
    rt.joinAgent({
      sandboxId: "agent-b",
      role: "participant",
      protocolId: "test.v1",
      apiVersion: "1",
    });
    rt.joinHuman("human");

    const seq = rt.publishEvents([{ type: "hi" }]);
    expect(seq).toBe(1);
    await Promise.resolve();
    expect(received).toEqual([
      { agentId: "agent-a", seq: 1 },
      { agentId: "agent-b", seq: 1 },
    ]);
  });

  it("fanoutSessionEventsToMailboxes no-ops without handler", async () => {
    await expect(
      fanoutSessionEventsToMailboxes([
        { agentId: "x", sandboxId: "x", seq: 1, event: {} },
      ])
    ).resolves.toBeUndefined();
  });
});
