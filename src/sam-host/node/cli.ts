#!/usr/bin/env node
/**
 * CLI: npx / npm run sam-host -- start <dir> [<dir>…]
 *      npm run sam-host -- command <id> <json>
 *      npm run sam-host -- list
 *
 * Demo mode (no args): start ping-a + ping-b fixtures, hit, wait alarm, ping, stop.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeSamHost } from "./host.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(__dirname, "../fixtures");

async function demo(): Promise<void> {
  const host = new NodeSamHost();
  const a = await host.startDir(join(fixturesRoot, "ping-a"), "ping-a");
  const b = await host.startDir(join(fixturesRoot, "ping-b"), "ping-b");
  console.log("started", host.list().join(", "));
  console.log(
    "meta",
    JSON.stringify({ a: a.getMeta(), b: b.getMeta() }, null, 2)
  );
  console.log("hit a", await host.command("ping-a", { type: "hit" }));
  console.log("hit a", await host.command("ping-a", { type: "hit" }));
  await host.command("ping-a", { type: "arm_alarm", delayMs: 40 });
  await host.command("ping-b", { type: "arm_alarm", delayMs: 40 });
  await new Promise(r => setTimeout(r, 80));
  console.log("ping a", await host.command("ping-a", { type: "ping" }));
  console.log("ping b", await host.command("ping-b", { type: "ping" }));
  await host.stopAll();
  console.log("stopped");
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "demo") {
    await demo();
    return;
  }
  const host = new NodeSamHost();
  const shutdown = async () => {
    await host.stopAll();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });

  if (cmd === "start") {
    if (!rest.length) throw new Error("usage: sam-host start <dir> [<dir>…]");
    for (const dir of rest) {
      const inst = await host.startDir(dir);
      console.log("started", inst.id, inst.getMeta().name ?? "");
    }
    console.log("running", host.list().join(", "), "(Ctrl+C to stop)");
    await new Promise(() => undefined);
    return;
  }
  if (cmd === "list") {
    console.log("(use demo or keep start process; list is in-process only)");
    return;
  }
  if (cmd === "command") {
    const [id, json] = rest;
    if (!id || !json) throw new Error("usage: sam-host command <id> <json>");
    // One-shot: start is not persisted — prefer demo for smoke.
    throw new Error(
      "command requires a long-running start session; use `npm run sam-host` demo for smoke"
    );
  }
  throw new Error(`unknown command: ${cmd}`);
}

main(process.argv.slice(2)).catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
