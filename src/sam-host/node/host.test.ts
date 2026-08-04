import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NodeSamHost } from "./host.ts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");

describe("NodeSamHost", () => {
  it("runs two headless fixtures with isolated state and alarms", async () => {
    const host = new NodeSamHost();
    await host.startDir(join(fixtures, "ping-a"), "ping-a");
    await host.startDir(join(fixtures, "ping-b"), "ping-b");
    expect(host.list().sort()).toEqual(["ping-a", "ping-b"]);

    await host.command("ping-a", { type: "hit" });
    await host.command("ping-a", { type: "hit" });
    const before = (await host.command("ping-a", { type: "ping" })) as {
      id: string;
      hits: number;
    };
    const b0 = (await host.command("ping-b", { type: "ping" })) as {
      hits: number;
    };
    expect(before.id).toBe("ping-a");
    expect(before.hits).toBe(2);
    expect(b0.hits).toBe(0);

    await host.command("ping-a", { type: "arm_alarm", delayMs: 40 });
    await host.command("ping-b", { type: "arm_alarm", delayMs: 40 });

    const deadline = Date.now() + 1000;
    let afterA = { hits: 0 };
    let afterB = { hits: 0 };
    while (Date.now() < deadline) {
      afterA = (await host.command("ping-a", { type: "ping" })) as {
        hits: number;
      };
      afterB = (await host.command("ping-b", { type: "ping" })) as {
        hits: number;
      };
      if (afterA.hits >= 102 && afterB.hits >= 100) break;
      await new Promise(r => setTimeout(r, 30));
    }
    expect(afterA.hits).toBe(102);
    expect(afterB.hits).toBe(100);

    await host.stopAll();
    expect(host.list()).toEqual([]);
  });

  it("exchanges mailbox messages between two fixtures", async () => {
    const host = new NodeSamHost();
    await host.startDir(join(fixtures, "ping-a"), "ping-a");
    await host.startDir(join(fixtures, "ping-b"), "ping-b");

    await host.command("ping-a", {
      type: "tell",
      to: "ping-b",
      msgType: "app.ping",
      payload: { replyTo: "ping-a", n: 1 },
    });
    // tell only enqueues; await drain for delivery (+ reply)
    await host.runtime.kickDrain();

    const mailB = (await host.command("ping-b", { type: "mail" })) as unknown[];
    const mailA = (await host.command("ping-a", { type: "mail" })) as unknown[];
    expect(mailB).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "app.ping", from: "ping-a" }),
      ])
    );
    expect(mailA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "app.pong",
          payload: { fromLabel: "B" },
        }),
      ])
    );

    await host.stopAll();
  });
});
