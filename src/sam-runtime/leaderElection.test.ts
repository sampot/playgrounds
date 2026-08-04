import { describe, expect, it } from "vitest";
import { createMemoryKv } from "./bindings.ts";
import { SamInstance } from "./instance.ts";
import { FakeClock } from "./leaderClock.ts";
import { LeaderElection } from "./leaderElection.ts";
import { FakeLockManager } from "./leaderLock.ts";
import { LeaderStore } from "./leaderStore.ts";
import { loadEsmFromFileMap } from "./moduleLoader.ts";
import { AgentRuntime } from "./runtime.ts";
import { createMemoryStorage } from "./storage.ts";

const TIMING = {
  tHeartbeatMs: 100,
  tTakeoverMs: 50,
  tSelfCheckMs: 20,
  pollMs: 10,
};

async function flush(n = 40): Promise<void> {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

function makeElection(
  peerId: string,
  storage: ReturnType<typeof createMemoryStorage>,
  locks: FakeLockManager,
  clock: FakeClock,
  hooks?: {
    onBecameLeader?: (epoch: number) => void;
    onLostLeadership?: (reason: string) => void;
  }
) {
  return new LeaderElection({
    peerId,
    storage,
    requestLock: locks.request,
    clock,
    ...TIMING,
    ...hooks,
  });
}

function makeAgent(kv: ReturnType<typeof createMemoryKv>) {
  return new SamInstance({
    id: "agent",
    loadEsm: loadEsmFromFileMap,
    createEnv: () => ({ KV: kv }),
    files: {
      "index.html": `<head><title>agent</title></head>`,
      "controller.js": `
export default {
  async onStart(env) { await env.KV.put("n", "0"); },
  async onMessage(msg, env) {
    if (msg.type === "inc") {
      await env.KV.put("n", String(Number(await env.KV.get("n")) + 1));
    }
  },
  async onCommand(_, env) {
    return { n: Number(await env.KV.get("n")) };
  }
};
`,
    },
  });
}

describe("LeaderElection", () => {
  it("inaugurates only one leader after buffer", async () => {
    const clock = new FakeClock(1000);
    const locks = new FakeLockManager();
    const storage = createMemoryStorage();
    const became: string[] = [];

    const a = makeElection("a", storage, locks, clock, {
      onBecameLeader: () => {
        became.push("a");
      },
    });
    const b = makeElection("b", storage, locks, clock, {
      onBecameLeader: () => {
        became.push("b");
      },
    });
    a.start();
    b.start();

    await flush();
    await clock.advance(TIMING.pollMs);
    await flush();
    const pending = [a, b].filter(e => e.getRole() === "pending");
    expect(pending.length).toBe(1);

    await clock.advance(TIMING.tTakeoverMs);
    await flush();

    const leaders = [a, b].filter(e => e.isLeader());
    expect(leaders).toHaveLength(1);
    expect(became).toHaveLength(1);
    expect(leaders[0]!.getEpoch()).toBe(1);

    const hb = await new LeaderStore(storage).read();
    expect(hb?.status).toBe("formal");
    expect(hb?.epoch).toBe(1);

    await a.stop();
    await b.stop();
  });

  it("does not write formal heartbeat during buffer", async () => {
    const clock = new FakeClock(0);
    const locks = new FakeLockManager();
    const storage = createMemoryStorage();
    const a = makeElection("a", storage, locks, clock);
    a.start();
    // First loop iteration contends immediately (no formal heartbeat).
    await flush();
    expect(a.getRole()).toBe("pending");
    expect(await new LeaderStore(storage).read()).toBeNull();

    await clock.advance(TIMING.tTakeoverMs - 1);
    await flush();
    expect(a.getRole()).toBe("pending");
    expect(await new LeaderStore(storage).read()).toBeNull();

    await clock.advance(1);
    await flush();
    expect(a.isLeader()).toBe(true);
    expect((await new LeaderStore(storage).read())?.status).toBe("formal");

    await a.stop();
  });

  it("failover: lost lock → new leader bumps epoch and drains leftover", async () => {
    const clock = new FakeClock(0);
    const locks = new FakeLockManager();
    const storage = createMemoryStorage();
    const losses: string[] = [];
    const sharedKv = createMemoryKv();

    const electA = makeElection("a", storage, locks, clock, {
      onLostLeadership: r => {
        losses.push(`a:${r}`);
      },
    });
    const electB = makeElection("b", storage, locks, clock, {
      onLostLeadership: r => {
        losses.push(`b:${r}`);
      },
    });

    const runtimeA = new AgentRuntime({
      storage,
      autoDrain: false,
      election: electA,
    });
    const runtimeB = new AgentRuntime({
      storage,
      autoDrain: false,
      election: electB,
    });

    const instA = makeAgent(sharedKv);
    const instB = makeAgent(sharedKv);
    await instA.start();
    await instB.start();
    await runtimeA.attach(instA);
    await runtimeB.attach(instB);

    electA.start();
    electB.start();
    await flush();
    await clock.advance(TIMING.pollMs);
    await flush();
    await clock.advance(TIMING.tTakeoverMs);
    await flush();

    expect(electA.isLeader() !== electB.isLeader()).toBe(true);
    const firstIsA = electA.isLeader();
    const firstElect = firstIsA ? electA : electB;
    const secondElect = firstIsA ? electB : electA;
    const firstRt = firstIsA ? runtimeA : runtimeB;
    const secondRt = firstIsA ? runtimeB : runtimeA;
    const secondInst = firstIsA ? instB : instA;
    const firstPeer = firstIsA ? "a" : "b";

    expect(firstElect.getEpoch()).toBe(1);

    await firstRt.send({ to: "agent", type: "inc" });
    const claimed = await firstRt.mailbox.claimNext("agent");
    expect(claimed?.type).toBe("inc");
    // Crash mid-handler: inFlight left unacked.

    // Simulate lost lock (isHeld → false) then self-check degrade.
    locks.revoke();
    await clock.advance(TIMING.tSelfCheckMs);
    await flush();
    expect(firstElect.canDrain()).toBe(false);
    expect(firstElect.isLeader()).toBe(false);
    expect(losses.some(l => l.startsWith(`${firstPeer}:`))).toBe(true);

    // Follower may not have been queued on the lock; wait until heartbeat
    // is stale, then it contends, buffers, and inaugurates.
    for (let i = 0; i < 20 && !secondElect.isLeader(); i++) {
      await clock.advance(TIMING.pollMs);
      await flush();
      if (secondElect.getRole() === "pending") {
        await clock.advance(TIMING.tTakeoverMs);
        await flush();
        break;
      }
    }

    expect(secondElect.isLeader()).toBe(true);
    expect(secondElect.getEpoch()).toBe(2);

    await secondRt.kickDrain();
    const result = (await secondInst.command({})) as { n: number };
    expect(result.n).toBe(1);
    expect(await secondRt.mailbox.pendingCount("agent")).toBe(0);

    await electA.stop();
    await electB.stop();
  });

  it("revoke makes canDrain false before callback exits", async () => {
    const clock = new FakeClock(0);
    const locks = new FakeLockManager();
    const storage = createMemoryStorage();
    const a = makeElection("a", storage, locks, clock);
    a.start();
    await flush();
    await clock.advance(TIMING.tTakeoverMs);
    await flush();
    expect(a.canDrain()).toBe(true);
    locks.revoke();
    expect(a.canDrain()).toBe(false);
    await a.stop();
  });

  it("canDrain is false for follower (no dual drain)", async () => {
    const clock = new FakeClock(0);
    const locks = new FakeLockManager();
    const storage = createMemoryStorage();
    const a = makeElection("a", storage, locks, clock);
    const b = makeElection("b", storage, locks, clock);
    a.start();
    b.start();
    await flush();
    await clock.advance(TIMING.pollMs + TIMING.tTakeoverMs);
    await flush();

    const leader = a.isLeader() ? a : b;
    const follower = a.isLeader() ? b : a;
    expect(leader.canDrain()).toBe(true);
    expect(follower.canDrain()).toBe(false);

    const rtL = new AgentRuntime({
      storage,
      autoDrain: false,
      election: leader,
    });
    const rtF = new AgentRuntime({
      storage,
      autoDrain: false,
      election: follower,
    });
    const kv = createMemoryKv();
    const mk = () => makeAgent(kv);
    const iL = mk();
    const iF = mk();
    await iL.start();
    await iF.start();
    await rtL.attach(iL);
    await rtF.attach(iF);
    await rtL.send({ to: "agent", type: "inc" });
    await rtF.kickDrain();
    expect(await rtL.mailbox.pendingCount("agent")).toBe(1);
    await rtL.kickDrain();
    expect(((await iL.command({})) as { n: number }).n).toBe(1);

    await a.stop();
    await b.stop();
  });
});
