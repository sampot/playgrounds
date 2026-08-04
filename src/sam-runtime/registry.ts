/**
 * Minimal agent registry (DEC-031 §6.6.1).
 * In-memory authority + serialized persist (avoids OPFS read-modify-write races
 * when many Controllers register in parallel).
 */

import { AgentRuntimeError } from "./errors.ts";
import { readJson, writeJson, type RuntimeStorage } from "./storage.ts";

export type AgentRegistryStatus =
  "registered" | "running" | "hibernated" | "stopped";

export interface AgentRegistryEntry {
  agentId: string;
  sandboxId: string;
  status: AgentRegistryStatus;
  /** Display name; not identity. */
  name?: string;
  updatedAt: number;
}

interface RegistryFile {
  agents: Record<string, AgentRegistryEntry>;
}

const KEY = "registry.json";

function emptyFile(): RegistryFile {
  return { agents: {} };
}

export class AgentRegistry {
  private file: RegistryFile = emptyFile();
  private ready: Promise<void>;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private storage: RuntimeStorage) {
    this.ready = readJson(this.storage, KEY, emptyFile()).then(f => {
      this.file = f;
    });
  }

  async flush(): Promise<void> {
    await this.ready;
    await this.writeChain;
  }

  private persist(): void {
    const snapshot: RegistryFile = {
      agents: Object.fromEntries(
        Object.entries(this.file.agents).map(([id, e]) => [id, { ...e }])
      ),
    };
    this.writeChain = this.writeChain.then(() =>
      writeJson(this.storage, KEY, snapshot)
    );
  }

  async register(input: {
    agentId: string;
    sandboxId: string;
    status?: AgentRegistryStatus;
    name?: string;
  }): Promise<AgentRegistryEntry> {
    await this.ready;
    const entry: AgentRegistryEntry = {
      agentId: input.agentId,
      sandboxId: input.sandboxId,
      status: input.status ?? "registered",
      name: input.name,
      updatedAt: Date.now(),
    };
    this.file.agents[entry.agentId] = entry;
    this.persist();
    return { ...entry };
  }

  async setStatus(
    agentId: string,
    status: AgentRegistryStatus
  ): Promise<AgentRegistryEntry> {
    await this.ready;
    const cur = this.file.agents[agentId];
    if (!cur) {
      throw new AgentRuntimeError("agent_not_found", agentId);
    }
    cur.status = status;
    cur.updatedAt = Date.now();
    this.persist();
    return { ...cur };
  }

  async unregister(agentId: string): Promise<void> {
    await this.ready;
    delete this.file.agents[agentId];
    this.persist();
  }

  async lookup(agentId: string): Promise<AgentRegistryEntry | null> {
    await this.ready;
    const e = this.file.agents[agentId];
    return e ? { ...e } : null;
  }

  async list(): Promise<AgentRegistryEntry[]> {
    await this.ready;
    return Object.values(this.file.agents)
      .map(e => ({ ...e }))
      .sort((a, b) => a.agentId.localeCompare(b.agentId));
  }

  async require(agentId: string): Promise<AgentRegistryEntry> {
    const e = await this.lookup(agentId);
    if (!e || e.status === "stopped") {
      throw new AgentRuntimeError("agent_not_found", agentId);
    }
    return e;
  }
}
