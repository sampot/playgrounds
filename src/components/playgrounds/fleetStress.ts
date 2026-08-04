/**
 * DEV / verification helper: start N background Agent Controllers at once.
 * Controllers are registry + SamInstance only (no OPFS project pollution).
 */

import {
  ensureAgentController,
  getFleetAgentInstance,
  stopAgentRuntime,
} from "./agentControllerHost";
import { getAgentRuntimeHub } from "./agentRuntimeHub";
import { createMockKvNamespace } from "./mockKv";
import type { FileMap } from "./projectTypes";

export const FLEET_STRESS_PREFIX = "fleet-stress-";

export type FleetStressOptions = {
  count?: number;
  /** Alarm cadence; default 1500ms. */
  tickMs?: number;
  /** How long to wait after start before sampling ticks. */
  settleMs?: number;
  /** Parallel Controller starts (iframe load). Default 8. */
  concurrency?: number;
  /** Delete Controllers after sampling. Default true. */
  cleanup?: boolean;
};

export type FleetStressResult = {
  requested: number;
  started: number;
  failed: number;
  errors: string[];
  startMs: number;
  settleMs: number;
  iframeCount: number;
  registryRunning: number;
  liveControllers: number;
  ticksPositive: number;
  ticksSample: Array<{ id: string; ticks: number; controller: string }>;
  heapUsedMB: number | null;
};

function stressControllerSource(tickMs: number): string {
  return `/**
 * Minimal background Controller for fleet stress (no functions.js / UI).
 */
const TICK_MS = ${Math.max(250, Math.floor(tickMs))};
export default {
  async onStart(env, ctx) {
    await env.KV.put("agent:controller", "up");
    await env.KV.put("agent:running", "1");
    await env.KV.put("agent:ticks", "0");
    if (ctx && typeof ctx.schedule === "function") {
      ctx.schedule({ delayMs: TICK_MS });
    }
  },
  async onStop(env) {
    await env.KV.put("agent:controller", "down");
  },
  async alarm(env, ctx) {
    if ((await env.KV.get("agent:running")) === "1") {
      const ticks = Number((await env.KV.get("agent:ticks")) || "0") + 1;
      await env.KV.put("agent:ticks", String(ticks));
      await env.KV.put("agent:lastAt", new Date().toISOString());
    }
    if (ctx && typeof ctx.schedule === "function") {
      ctx.schedule({ delayMs: TICK_MS });
    }
  },
};
`;
}

/** Controller-only Agent form (1 hidden iframe per agent). */
export function createFleetStressFiles(tickMs = 1500): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="sam:needs-controller" content="true" />
    <title>Fleet stress</title>
  </head>
  <body><p>fleet stress agent (no UI)</p></body>
</html>
`,
    "controller.js": stressControllerSource(tickMs),
  };
}

function stressIds(count: number, runId: string): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${FLEET_STRESS_PREFIX}${runId}-${String(i).padStart(3, "0")}`
  );
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function countModuleIframes(): number {
  // Legacy title from the old iframe ESM host; must stay 0 after DEC-031 fix.
  return document.querySelectorAll('iframe[title="playgrounds-sam-module"]')
    .length;
}

function heapUsedMB(): number | null {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number };
  };
  const used = perf.memory?.usedJSHeapSize;
  return typeof used === "number"
    ? Math.round((used / 1048576) * 10) / 10
    : null;
}

export async function cleanupFleetStress(
  ids: string[]
): Promise<{ stopped: number }> {
  let stopped = 0;
  for (const id of ids) {
    try {
      await stopAgentRuntime(id);
      stopped += 1;
    } catch {
      /* ignore */
    }
  }
  return { stopped };
}

async function waitForLeader(timeoutMs = 8000): Promise<void> {
  const hub = await getAgentRuntimeHub();
  if (hub.isLeader()) return;
  const t0 = performance.now();
  await new Promise<void>((resolve, reject) => {
    const unsub = hub.subscribe(status => {
      if (status.role === "leader" || status.role === "solo") {
        unsub();
        resolve();
      }
    });
    window.setTimeout(() => {
      unsub();
      if (hub.isLeader()) resolve();
      else {
        reject(
          new Error(
            `timed out waiting for Leader (${Math.round(performance.now() - t0)}ms)`
          )
        );
      }
    }, timeoutMs);
  });
}

async function waitUntilLive(id: string, timeoutMs = 15000): Promise<void> {
  const t0 = performance.now();
  while (!getFleetAgentInstance(id)) {
    if (performance.now() - t0 > timeoutMs) {
      throw new Error("controller not live after ensure");
    }
    await new Promise<void>(r => {
      window.setTimeout(r, 40);
    });
  }
}

/**
 * Start `count` background Controllers, wait for alarms, sample tick progress.
 */
export async function runFleetStress(
  opts: FleetStressOptions = {}
): Promise<FleetStressResult & { ids: string[] }> {
  const count = Math.max(1, Math.min(opts.count ?? 100, 500));
  const tickMs = opts.tickMs ?? 1500;
  const settleMs = opts.settleMs ?? tickMs * 3 + 500;
  const concurrency = opts.concurrency ?? 8;
  const cleanup = opts.cleanup !== false;
  const runId = Date.now().toString(36);
  const ids = stressIds(count, runId);
  const files = createFleetStressFiles(tickMs);
  const errors: string[] = [];

  await waitForLeader();

  const t0 = performance.now();
  const outcomes = await mapPool(ids, concurrency, async (id, i) => {
    try {
      await ensureAgentController(id, files, `stress-${i}`);
      await waitUntilLive(id);
      return true;
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  });
  const started = outcomes.filter(Boolean).length;
  const startMs = Math.round(performance.now() - t0);

  // Wait until alarms have a chance to fire, then poll until most have ticks.
  await new Promise<void>(r => {
    window.setTimeout(r, settleMs);
  });
  const pollDeadline = performance.now() + Math.max(settleMs, tickMs * 4);
  let ticksPositive = 0;
  let ticksSample: FleetStressResult["ticksSample"] = [];
  while (performance.now() < pollDeadline) {
    ticksPositive = 0;
    const rows: FleetStressResult["ticksSample"] = [];
    for (const id of ids) {
      const kv = createMockKvNamespace(id);
      const ticks = Number((await kv.get("agent:ticks")) || "0");
      const controller = String(
        (await kv.get("agent:controller")) || "missing"
      );
      if (ticks > 0) ticksPositive += 1;
      rows.push({ id, ticks, controller });
    }
    ticksSample = [
      ...rows.filter(s => s.ticks === 0).slice(0, 5),
      ...rows.filter(s => s.ticks > 0).slice(0, 5),
    ].slice(0, 8);
    if (ticksPositive >= Math.ceil(count * 0.95)) break;
    await new Promise<void>(r => {
      window.setTimeout(r, Math.min(500, tickMs));
    });
  }

  const hub = await getAgentRuntimeHub();
  await hub.runtime.registry.flush();
  const listed = await hub.runtime.registry.list();
  const registryRunning = listed.filter(
    a => a.status === "running" && ids.includes(a.agentId)
  ).length;
  const liveControllers = ids.filter(id => getFleetAgentInstance(id)).length;
  const compactSample = ticksSample;

  const result: FleetStressResult & { ids: string[] } = {
    requested: count,
    started,
    failed: count - started,
    errors: errors.slice(0, 12),
    startMs,
    settleMs,
    iframeCount: countModuleIframes(),
    registryRunning,
    liveControllers,
    ticksPositive,
    ticksSample: compactSample,
    heapUsedMB: heapUsedMB(),
    ids,
  };

  if (cleanup) {
    await cleanupFleetStress(ids);
  }

  return result;
}

declare global {
  interface Window {
    __playgroundsFleetStress?: typeof runFleetStress;
    __playgroundsFleetStressCleanup?: typeof cleanupFleetStress;
  }
}

/** Install DEV hooks on window (idempotent). */
export function installFleetStressHooks(): void {
  if (typeof window === "undefined") return;
  window.__playgroundsFleetStress = runFleetStress;
  window.__playgroundsFleetStressCleanup = cleanupFleetStress;
}
