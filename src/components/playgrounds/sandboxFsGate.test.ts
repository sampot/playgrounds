import { afterEach, describe, expect, it } from "vitest";
import { resetSandboxFsGateForTests, withSandboxFsGate } from "./sandboxFsGate";

afterEach(() => {
  resetSandboxFsGateForTests();
});

describe("withSandboxFsGate", () => {
  it("serializes overlapping critical sections for the same sandbox", async () => {
    const order: number[] = [];
    const a = withSandboxFsGate("sb-a", async () => {
      order.push(1);
      await new Promise(r => setTimeout(r, 30));
      order.push(2);
      return "a";
    });
    const b = withSandboxFsGate("sb-a", async () => {
      order.push(3);
      await new Promise(r => setTimeout(r, 5));
      order.push(4);
      return "b";
    });
    expect(await Promise.all([a, b])).toEqual(["a", "b"]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("does not serialize different sandboxes", async () => {
    const order: string[] = [];
    const a = withSandboxFsGate("sb-a", async () => {
      order.push("a-start");
      await new Promise(r => setTimeout(r, 40));
      order.push("a-end");
    });
    const b = withSandboxFsGate("sb-b", async () => {
      order.push("b-start");
      await new Promise(r => setTimeout(r, 5));
      order.push("b-end");
    });
    await Promise.all([a, b]);
    expect(order.indexOf("b-end")).toBeLessThan(order.indexOf("a-end"));
  });
});
