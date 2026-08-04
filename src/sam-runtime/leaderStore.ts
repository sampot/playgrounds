/**
 * Durable Leader heartbeat / epoch (DEC-031 Phase 2).
 */

import { LEADER_STATE_KEY } from "./constants.ts";
import { readJson, writeJson, type RuntimeStorage } from "./storage.ts";

export type LeaderHeartbeatStatus = "formal" | "pending";

export interface LeaderState {
  epoch: number;
  at: number;
  peerId: string;
  status: LeaderHeartbeatStatus;
}

export class LeaderStore {
  constructor(private storage: RuntimeStorage) {}

  async read(): Promise<LeaderState | null> {
    const s = await readJson<LeaderState | null>(
      this.storage,
      LEADER_STATE_KEY,
      null
    );
    if (!s || typeof s.epoch !== "number" || typeof s.at !== "number") {
      return null;
    }
    return s;
  }

  async write(state: LeaderState): Promise<void> {
    await writeJson(this.storage, LEADER_STATE_KEY, state);
  }
}
