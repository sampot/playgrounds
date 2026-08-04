/**
 * Controller host: SamInstances run in Backend Runtime Worker (DEC-038).
 * Shell keeps AgentRuntime mailbox drain + Leader election; Controllers are remote.
 *
 * - Steward（總管）seat: Controller with env.HOST.
 * - Fleet / session Agents: Controllers without HOST.
 */

import { CONTROLLER_ENTRY, parseSamHead } from "../../sam-runtime/index.ts";
import type { SamInstance as SamInstanceType } from "../../sam-runtime/index.ts";
import {
  getAgentRuntimeHub,
  type AgentRuntimeHub,
  type AgentRuntimeHubStatus,
} from "./agentRuntimeHub";
import { startBackendRuntime, stopBackendRuntime } from "./backendHost";
import { invalidateFunctionsModuleCache } from "./canvasSw";
import { RemoteSamInstance } from "./remoteSamInstance";
import { isTextContent, type FileMap } from "./projectTypes";

let current: RemoteSamInstance | null = null;
let currentId: string | null = null;
/** Last requested active steward (survives follower role). */
let desiredId: string | null = null;
let desiredFiles: FileMap | null = null;
/**
 * Non-steward Agent Controllers (DEC-031): session seats + Agent-form SAMs.
 * No HOST — only the steward seat gets env.HOST.
 */
const fleetLive = new Map<string, RemoteSamInstance>();
const fleetDesired = new Map<string, FileMap>();
let hubReady: Promise<AgentRuntimeHub> | null = null;
let roleUnsub: (() => void) | null = null;

export function getAgentControllerInstance(): SamInstanceType | null {
  return current?.asSamInstance() ?? null;
}

export function getAgentControllerSandboxId(): string | null {
  return currentId;
}

export function agentFilesHaveController(files: FileMap): boolean {
  const c = files[CONTROLLER_ENTRY];
  return c !== undefined && isTextContent(c);
}

/**
 * True when this FileMap should run in Agent form (Controller attached).
 * Authority: `sam:needs-controller` in index.html, or presence of controller.js.
 */
export function fileMapNeedsAgentController(files: FileMap): boolean {
  if (!agentFilesHaveController(files)) return false;
  const html = files["index.html"];
  if (isTextContent(html)) {
    const head = parseSamHead(html);
    if (head.needsController === false) return false;
    if (head.needsController === true) return true;
  }
  return true;
}

async function ensureHub(): Promise<AgentRuntimeHub> {
  if (!hubReady) {
    hubReady = (async () => {
      const hub = await getAgentRuntimeHub();
      hub.setRoleHandlers({
        onLeader: async () => {
          await startBackendRuntime(hub.getStatus().epoch);
          if (desiredId && desiredFiles) {
            await startLocalController(desiredId, desiredFiles);
          }
          for (const [id, files] of fleetDesired) {
            await startFleetController(id, files);
          }
        },
        onFollower: async () => {
          await stopLocalController({ restartFleet: false });
          await stopAllFleetControllers({ keepDesired: true });
          await stopBackendRuntime();
          invalidateFunctionsModuleCache();
        },
      });
      hub.start();
      return hub;
    })();
  }
  return hubReady;
}

async function startLocalController(
  sandboxId: string,
  files: FileMap
): Promise<void> {
  if (currentId === sandboxId && current?.started) return;
  await stopLocalController({ restartFleet: false });
  await detachFleetLive(sandboxId);
  const hub = await ensureHub();
  await startBackendRuntime(hub.getStatus().epoch);
  const remote = new RemoteSamInstance({
    id: sandboxId,
    files,
    withHost: true,
    activeAgentSandboxId: sandboxId,
  });
  await remote.start();
  // Worker AgentRuntime.attach — shell only keeps RemoteSamInstance for command／UI.
  current = remote;
  currentId = sandboxId;
}

async function detachFleetLive(sandboxId: string): Promise<void> {
  const inst = fleetLive.get(sandboxId);
  if (!inst) return;
  await inst.stop();
  fleetLive.delete(sandboxId);
}

async function stopLocalController(opts?: {
  restartFleet?: boolean;
}): Promise<void> {
  const restartFleet = opts?.restartFleet !== false;
  const stoppedId = currentId;
  const hub = hubReady ? await hubReady : null;
  if (current) {
    await current.stop();
  }
  current = null;
  currentId = null;
  if (
    restartFleet &&
    stoppedId &&
    fleetDesired.has(stoppedId) &&
    hub?.isLeader()
  ) {
    await startFleetController(stoppedId, fleetDesired.get(stoppedId)!);
  }
}

/**
 * Start or replace the Controller for the steward seat when this tab is Leader.
 */
export async function syncAgentController(
  sandboxId: string | null,
  files: FileMap
): Promise<{ running: boolean; role: AgentRuntimeHubStatus["role"] }> {
  const hub = await ensureHub();
  if (!sandboxId) {
    desiredId = null;
    desiredFiles = null;
    await stopLocalController();
    return { running: false, role: hub.getStatus().role };
  }
  if (!agentFilesHaveController(files)) {
    desiredId = null;
    desiredFiles = null;
    await stopLocalController();
    throw new Error(
      "總管需要根目錄 controller.js（DEC-024；不支援僅 app.js loop）"
    );
  }
  desiredId = sandboxId;
  desiredFiles = files;
  fleetDesired.set(sandboxId, files);

  if (!hub.isLeader()) {
    await stopLocalController({ restartFleet: false });
    return { running: false, role: hub.getStatus().role };
  }

  await startLocalController(sandboxId, files);
  return { running: true, role: hub.getStatus().role };
}

export async function stopAgentController(): Promise<void> {
  desiredId = null;
  desiredFiles = null;
  await stopLocalController();
}

export async function commandAgentController(
  command: unknown
): Promise<unknown> {
  const hub = await ensureHub();
  if (current && hub.isLeader()) {
    return current.command(command);
  }
  const fleetInst =
    (desiredId && fleetLive.get(desiredId)) ||
    (currentId && fleetLive.get(currentId));
  if (fleetInst && hub.isLeader()) {
    return fleetInst.command(command);
  }
  const to = desiredId ?? currentId;
  if (!to) {
    throw new Error("agent_controller_not_running");
  }
  const { id } = await hub.runtime.send({
    to,
    from: "host",
    type: "system.command",
    payload: command,
  });
  return { enqueued: true, id, role: hub.getStatus().role };
}

export function subscribeAgentRuntimeRole(
  listener: (status: AgentRuntimeHubStatus) => void
): () => void {
  let unsub: () => void = () => {};
  void ensureHub().then(hub => {
    unsub = hub.subscribe(listener);
    roleUnsub = unsub;
  });
  return () => {
    unsub();
    if (roleUnsub === unsub) roleUnsub = null;
  };
}

export function getDesiredAgentSandboxId(): string | null {
  return desiredId;
}

async function startFleetController(
  sandboxId: string,
  files: FileMap
): Promise<void> {
  if (fleetLive.has(sandboxId)) return;
  if (currentId === sandboxId && current) return;
  if (!agentFilesHaveController(files)) return;
  const hub = await ensureHub();
  if (!hub.isLeader()) return;
  await startBackendRuntime(hub.getStatus().epoch);
  const remote = new RemoteSamInstance({
    id: sandboxId,
    files,
    withHost: false,
    activeAgentSandboxId: desiredId,
  });
  await remote.start();
  fleetLive.set(sandboxId, remote);
}

async function stopAllFleetControllers(opts?: {
  keepDesired?: boolean;
}): Promise<void> {
  const ids = [...fleetLive.keys()];
  for (const id of ids) {
    const inst = fleetLive.get(id);
    if (inst) await inst.stop();
    fleetLive.delete(id);
  }
  if (!opts?.keepDesired) fleetDesired.clear();
}

/**
 * Register an Agent-form SAM in the runtime registry and, on Leader, start its
 * Controller without HOST.
 */
export async function ensureAgentController(
  sandboxId: string,
  files: FileMap,
  name?: string
): Promise<void> {
  if (!agentFilesHaveController(files)) return;
  const hub = await ensureHub();
  fleetDesired.set(sandboxId, files);
  await hub.runtime.registry.register({
    agentId: sandboxId,
    sandboxId,
    status: hub.isLeader() ? "running" : "registered",
    name,
  });
  if (hub.isLeader()) {
    await startFleetController(sandboxId, files);
  }
}

/** @deprecated Prefer ensureAgentController — same behaviour. */
export async function syncSessionSeatAgent(
  sandboxId: string,
  files: FileMap,
  name?: string
): Promise<void> {
  return ensureAgentController(sandboxId, files, name);
}

export async function stopAgentRuntime(sandboxId: string): Promise<void> {
  fleetDesired.delete(sandboxId);
  if (desiredId === sandboxId) {
    desiredId = null;
    desiredFiles = null;
  }
  if (currentId === sandboxId) {
    if (current) await current.stop();
    current = null;
    currentId = null;
  }
  const inst = fleetLive.get(sandboxId);
  if (inst) await inst.stop();
  fleetLive.delete(sandboxId);
  const hub = hubReady ? await hubReady : null;
  if (hub) {
    try {
      await hub.runtime.registry.unregister(sandboxId);
    } catch {
      /* ignore */
    }
  }
}

/** @deprecated Prefer stopAgentRuntime. */
export async function stopSessionSeatAgent(sandboxId: string): Promise<void> {
  return stopAgentRuntime(sandboxId);
}

export function getSessionSeatInstance(
  sandboxId: string
): SamInstanceType | null {
  return fleetLive.get(sandboxId)?.asSamInstance() ?? null;
}

export function getFleetAgentInstance(
  sandboxId: string
): SamInstanceType | null {
  return fleetLive.get(sandboxId)?.asSamInstance() ?? null;
}

/**
 * FileMap last registered for an Agent-form / steward Controller on this tab.
 */
export function getDesiredAgentFiles(sandboxId: string): FileMap | null {
  if (desiredId === sandboxId && desiredFiles) return desiredFiles;
  return fleetDesired.get(sandboxId) ?? null;
}
