import { describe, expect, it } from "vitest";
import { AgentRuntimeHub } from "./agentRuntimeHub";

describe("AgentRuntimeHub", () => {
  it("solo mode (no election) is leader and canDrain", () => {
    const hub = AgentRuntimeHub.createForTest({ peerId: "p1" });
    hub.start();
    expect(hub.isLeader()).toBe(true);
    expect(hub.getStatus().role).toBe("solo");
    expect(hub.getStatus().canDrain).toBe(true);
  });

  it("notifies subscribers on start", async () => {
    const hub = AgentRuntimeHub.createForTest({ peerId: "p2" });
    const roles: string[] = [];
    hub.subscribe(s => {
      roles.push(s.role);
    });
    hub.start();
    expect(roles).toContain("solo");
  });
});
