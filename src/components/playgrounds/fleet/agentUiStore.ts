/**
 * Durable agent.ui annotations (DEC-032 Phase 5).
 * Stored under playgrounds-agent-runtime/ui-annotations.json — not in sandbox Code.
 * Shell renders only; does not validate business meaning.
 */

import {
  readJson,
  writeJson,
  type RuntimeStorage,
} from "../../../sam-runtime/storage.ts";
import type { AgentUiAnnotation } from "./types.ts";

const KEY = "ui-annotations.json";

export type AgentUiPatch = {
  roleLabel?: string | null;
  groupId?: string | null;
  health?: "ok" | "warn" | "error" | null;
  healthDetail?: string | null;
  successorOf?: string | null;
};

interface UiFile {
  byAgentId: Record<string, AgentUiAnnotation>;
}

function emptyFile(): UiFile {
  return { byAgentId: {} };
}

/** Normalize / clamp annotation fields for storage. */
export function normalizeAgentUi(
  input: AgentUiAnnotation | AgentUiPatch | null | undefined
): AgentUiAnnotation | null {
  if (!input || typeof input !== "object") return null;
  const out: AgentUiAnnotation = {};
  if (typeof input.roleLabel === "string") {
    const s = input.roleLabel.trim().slice(0, 64);
    if (s) out.roleLabel = s;
  }
  if (typeof input.groupId === "string") {
    const s = input.groupId.trim().slice(0, 64);
    if (s) out.groupId = s;
  }
  if (
    input.health === "ok" ||
    input.health === "warn" ||
    input.health === "error"
  ) {
    out.health = input.health;
  }
  if (typeof input.healthDetail === "string") {
    const s = input.healthDetail.trim().slice(0, 200);
    if (s) out.healthDetail = s;
  }
  if (typeof input.successorOf === "string") {
    const s = input.successorOf.trim().slice(0, 128);
    if (s) out.successorOf = s;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function applyPatch(
  cur: AgentUiAnnotation | undefined,
  patch: AgentUiPatch
): AgentUiAnnotation | null {
  const next: AgentUiAnnotation = { ...(cur ?? {}) };
  for (const key of [
    "roleLabel",
    "groupId",
    "health",
    "healthDetail",
    "successorOf",
  ] as const) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (v === null || v === "") {
      delete next[key];
    } else if (key === "health") {
      if (v === "ok" || v === "warn" || v === "error") next.health = v;
    } else if (typeof v === "string") {
      next[key] = v;
    }
  }
  return normalizeAgentUi(next);
}

export class AgentUiStore {
  constructor(private storage: RuntimeStorage) {}

  async list(): Promise<Record<string, AgentUiAnnotation>> {
    const file = await readJson(this.storage, KEY, emptyFile());
    const out: Record<string, AgentUiAnnotation> = {};
    for (const [id, ann] of Object.entries(file.byAgentId ?? {})) {
      const n = normalizeAgentUi(ann);
      if (n) out[id] = n;
    }
    return out;
  }

  async get(agentId: string): Promise<AgentUiAnnotation | null> {
    const all = await this.list();
    return all[agentId] ?? null;
  }

  async set(
    agentId: string,
    patch: AgentUiPatch
  ): Promise<AgentUiAnnotation | null> {
    const id = agentId?.trim();
    if (!id) throw new Error("bad_args: agentId required");
    const file = await readJson(this.storage, KEY, emptyFile());
    if (!file.byAgentId) file.byAgentId = {};
    const merged = applyPatch(file.byAgentId[id], patch);
    if (!merged) {
      delete file.byAgentId[id];
    } else {
      file.byAgentId[id] = merged;
    }
    await writeJson(this.storage, KEY, file);
    return merged;
  }

  async clear(agentId: string): Promise<void> {
    await this.set(agentId, {
      roleLabel: null,
      groupId: null,
      health: null,
      healthDetail: null,
      successorOf: null,
    });
  }
}
