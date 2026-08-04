import { describe, expect, it } from "vitest";
import { MAILBOX_CAPACITY, N_MAX_ATTEMPTS } from "./constants.ts";
import { drainAgent } from "./drainLoop.ts";
import { AgentRuntimeError } from "./errors.ts";
import { MailboxStore } from "./mailboxStore.ts";
import { createAgentMessage } from "./message.ts";
import { createMemoryStorage } from "./storage.ts";

describe("MailboxStore", () => {
  it("enqueues, claims, acks with dedupe", async () => {
    const box = new MailboxStore(createMemoryStorage());
    const msg = createAgentMessage({
      id: "m1",
      from: "a",
      to: "b",
      type: "app.ping",
      payload: { n: 1 },
    });
    await box.enqueue("b", msg);
    const claimed = await box.claimNext("b");
    expect(claimed?.id).toBe("m1");
    expect(claimed?.deliveryAttempts).toBe(1);
    await box.ack("b", "m1");
    expect(await box.claimNext("b")).toBeNull();
    // Re-enqueue same id is no-op success
    await box.enqueue("b", msg);
    expect(await box.pendingCount("b")).toBe(0);
  });

  it("rejects when full", async () => {
    const box = new MailboxStore(createMemoryStorage());
    for (let i = 0; i < MAILBOX_CAPACITY; i++) {
      await box.enqueue(
        "x",
        createAgentMessage({
          id: `id-${i}`,
          from: "a",
          to: "x",
          type: "t",
        })
      );
    }
    await expect(
      box.enqueue(
        "x",
        createAgentMessage({ id: "overflow", from: "a", to: "x", type: "t" })
      )
    ).rejects.toMatchObject({ code: "mailbox_full" });
  });

  it("poisons after N_maxAttempts", async () => {
    const box = new MailboxStore(createMemoryStorage());
    await box.enqueue(
      "p",
      createAgentMessage({ id: "bad", from: "a", to: "p", type: "boom" })
    );
    let attempts = 0;
    await drainAgent({
      agentId: "p",
      mailbox: box,
      retryDelayMs: 0,
      handle: async () => {
        attempts += 1;
        throw new Error("fail");
      },
    });
    expect(attempts).toBe(N_MAX_ATTEMPTS);
    const poison = await box.listPoison("p");
    expect(poison).toHaveLength(1);
    expect(poison[0]?.id).toBe("bad");
    expect(await box.pendingCount("p")).toBe(0);
  });

  it("restores inFlight after crash (claim without ack)", async () => {
    const storage = createMemoryStorage();
    const box1 = new MailboxStore(storage);
    await box1.enqueue(
      "c",
      createAgentMessage({ id: "r1", from: "a", to: "c", type: "t" })
    );
    const first = await box1.claimNext("c");
    expect(first?.id).toBe("r1");
    // Crash: new store, same storage — inFlight still present
    const box2 = new MailboxStore(storage);
    const again = await box2.claimNext("c");
    expect(again?.id).toBe("r1");
    expect(again?.deliveryAttempts).toBe(1);
    await box2.ack("c", "r1");
  });

  it("throws mailbox_poisoned on re-send of poisoned id", async () => {
    const box = new MailboxStore(createMemoryStorage());
    await box.enqueue(
      "p",
      createAgentMessage({ id: "tox", from: "a", to: "p", type: "t" })
    );
    await drainAgent({
      agentId: "p",
      mailbox: box,
      retryDelayMs: 0,
      handle: async () => {
        throw new Error("x");
      },
    });
    await expect(
      box.enqueue(
        "p",
        createAgentMessage({ id: "tox", from: "a", to: "p", type: "t" })
      )
    ).rejects.toBeInstanceOf(AgentRuntimeError);
  });

  it("summarize and listMessageHeaders omit payloads", async () => {
    const box = new MailboxStore(createMemoryStorage());
    await box.enqueue(
      "s",
      createAgentMessage({
        id: "h1",
        from: "a",
        to: "s",
        type: "app.ping",
        payload: { secret: true },
      })
    );
    const summary = await box.summarize("s");
    expect(summary).toEqual({
      depth: 1,
      inFlight: false,
      poisonCount: 0,
    });
    const headers = await box.listMessageHeaders("s", 10);
    expect(headers).toHaveLength(1);
    expect(headers[0]).toMatchObject({
      id: "h1",
      type: "app.ping",
      state: "queued",
    });
    expect(headers[0]).not.toHaveProperty("payload");
  });

  it("discardPoison and requeuePoison", async () => {
    const box = new MailboxStore(createMemoryStorage());
    await box.enqueue(
      "p",
      createAgentMessage({ id: "tox", from: "a", to: "p", type: "t" })
    );
    await drainAgent({
      agentId: "p",
      mailbox: box,
      retryDelayMs: 0,
      handle: async () => {
        throw new Error("x");
      },
    });
    expect(await box.listPoison("p")).toHaveLength(1);
    expect(await box.requeuePoison("p", "tox")).toBe(true);
    expect(await box.listPoison("p")).toHaveLength(0);
    expect(await box.pendingCount("p")).toBe(1);
    const claimed = await box.claimNext("p");
    expect(claimed?.id).toBe("tox");
    expect(claimed?.deliveryAttempts).toBe(1);
    await box.fail("p", "tox", { poison: true });
    expect(await box.discardPoison("p", "tox")).toBe(true);
    expect(await box.listPoison("p")).toHaveLength(0);
  });
});
