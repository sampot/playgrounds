/**
 * Minimal multi-instance headless SAM host (DEC-024 / DEC-031).
 */

import { basename, resolve } from "node:path";
import {
  AgentRuntime,
  SamInstance,
  createHostStub,
  createMemoryKv,
  loadEsmFromFileMap,
} from "../../sam-runtime/node.ts";
import { loadSamDir } from "./loadSamDir.ts";

export class NodeSamHost {
  private instances = new Map<string, SamInstance>();
  readonly runtime = new AgentRuntime();

  list(): string[] {
    return [...this.instances.keys()];
  }

  get(id: string): SamInstance | undefined {
    return this.instances.get(id);
  }

  async startDir(dir: string, id?: string): Promise<SamInstance> {
    const abs = resolve(dir);
    const instanceId = id ?? basename(abs);
    if (this.instances.has(instanceId)) {
      throw new Error(`instance already running: ${instanceId}`);
    }
    const files = await loadSamDir(abs);
    const inst = new SamInstance({
      id: instanceId,
      files,
      loadEsm: loadEsmFromFileMap,
      createEnv: () => ({
        KV: createMemoryKv(),
        HOST: createHostStub(),
      }),
    });
    await inst.start();
    await this.runtime.attach(inst);
    this.instances.set(instanceId, inst);
    return inst;
  }

  async command(id: string, command: unknown): Promise<unknown> {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`unknown instance: ${id}`);
    return inst.command(command);
  }

  async send(
    to: string,
    message: { type: string; payload?: unknown; from?: string }
  ): Promise<{ id: string }> {
    return this.runtime.send({
      to,
      type: message.type,
      payload: message.payload,
      from: message.from ?? "host",
    });
  }

  async stop(id: string): Promise<void> {
    const inst = this.instances.get(id);
    if (!inst) return;
    await this.runtime.detach(id);
    await inst.stop();
    this.instances.delete(id);
  }

  async stopAll(): Promise<void> {
    const ids = [...this.instances.keys()];
    for (const id of ids) {
      await this.stop(id);
    }
  }
}
