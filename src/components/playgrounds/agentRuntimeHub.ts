/**
 * Shell Agent runtime hub: Leader election + AgentRuntime (DEC-031 Phase 3).
 * Leader tab drains Controllers; followers enqueue only.
 */

import {
  AgentRuntime,
  LeaderElection,
  createMemoryStorage,
  createWebLockRequest,
  type LeaderRole,
  type RuntimeStorage,
} from "../../sam-runtime/index.ts";
import { AgentUiStore } from "./fleet/agentUiStore";
import { TrafficStore } from "./fleet/trafficStore";
import { createOpfsRuntimeStorage } from "./opfsRuntimeStorage";
import { isOpfsSupported } from "./opfsStore";

const PEER_KEY = "playgrounds-agent-runtime-peer";

export type AgentRuntimeHubRole = LeaderRole | "solo";

export interface AgentRuntimeHubStatus {
  role: AgentRuntimeHubRole;
  peerId: string;
  epoch: number;
  canDrain: boolean;
}

type RoleListener = (status: AgentRuntimeHubStatus) => void;

function peerId(): string {
  if (typeof sessionStorage === "undefined") {
    return `peer_${Math.random().toString(36).slice(2, 10)}`;
  }
  try {
    let id = sessionStorage.getItem(PEER_KEY);
    if (!id) {
      id = `peer_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(PEER_KEY, id);
    }
    return id;
  } catch {
    return `peer_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function locksAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
  );
}

export class AgentRuntimeHub {
  readonly peerId: string;
  readonly runtime: AgentRuntime;
  readonly agentUi: AgentUiStore;
  readonly traffic: TrafficStore;
  private election: LeaderElection | null;
  private role: AgentRuntimeHubRole;
  private listeners = new Set<RoleListener>();
  private started = false;
  private onLeader?: () => void | Promise<void>;
  private onFollower?: () => void | Promise<void>;

  private constructor(
    storage: RuntimeStorage,
    peer: string,
    election: LeaderElection | null
  ) {
    this.peerId = peer;
    this.election = election;
    this.role = election ? "follower" : "solo";
    this.agentUi = new AgentUiStore(storage);
    this.traffic = new TrafficStore(storage);
    this.runtime = new AgentRuntime({
      storage,
      // Drain runs in Backend Runtime Worker when Leader (DEC-038).
      autoDrain: false,
      election: election ?? undefined,
      onMessageEnqueued: info => {
        void this.traffic.record({
          from: info.from,
          to: info.to,
          at: info.sentAt,
        });
        if (this.isLeader()) {
          void import("./backendHost").then(m => {
            void m.backendKickDrain();
          });
        }
      },
    });
    if (!election) this.runtime.setLeader(true);
    else this.runtime.setLeader(false);
  }

  static async create(): Promise<AgentRuntimeHub> {
    const peer = peerId();
    let storage: RuntimeStorage;
    try {
      storage = isOpfsSupported()
        ? await createOpfsRuntimeStorage()
        : createMemoryStorage();
    } catch {
      storage = createMemoryStorage();
    }

    if (!locksAvailable()) {
      return new AgentRuntimeHub(storage, peer, null);
    }

    // Placeholder election wiring after hub exists (callbacks close over hub).
    const hub = new AgentRuntimeHub(storage, peer, null);
    const election = new LeaderElection({
      peerId: peer,
      storage,
      requestLock: createWebLockRequest(),
      onBecameLeader: async () => {
        hub.role = "leader";
        hub.runtime.setLeader(true);
        hub.emit();
        await hub.onLeader?.();
        void import("./backendHost").then(m => {
          m.pushDrainGateToBackendRuntime({
            canDrain: true,
            isLeader: true,
            epoch: hub.getStatus().epoch,
          });
          void m.backendKickDrain();
        });
      },
      onLostLeadership: async () => {
        hub.role = "follower";
        hub.runtime.setLeader(false);
        hub.emit();
        void import("./backendHost").then(m => {
          m.pushDrainGateToBackendRuntime({
            canDrain: false,
            isLeader: false,
            epoch: hub.getStatus().epoch,
          });
        });
        await hub.onFollower?.();
      },
    });
    hub.election = election;
    hub.runtime.setElection(election);
    hub.role = "follower";
    hub.runtime.setLeader(false);
    return hub;
  }

  /** @internal test helper */
  static createForTest(opts: {
    storage?: RuntimeStorage;
    election?: LeaderElection | null;
    peerId?: string;
  }): AgentRuntimeHub {
    return new AgentRuntimeHub(
      opts.storage ?? createMemoryStorage(),
      opts.peerId ?? "test-peer",
      opts.election ?? null
    );
  }

  /** Shell hooks: start/stop Controllers when role flips. */
  setRoleHandlers(handlers: {
    onLeader?: () => void | Promise<void>;
    onFollower?: () => void | Promise<void>;
  }): void {
    this.onLeader = handlers.onLeader;
    this.onFollower = handlers.onFollower;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    if (this.election) {
      this.election.start();
    } else {
      this.role = "solo";
      this.runtime.setLeader(true);
      this.emit();
      void this.onLeader?.();
    }
  }

  async stop(): Promise<void> {
    if (this.election) await this.election.stop();
    this.started = false;
  }

  getStatus(): AgentRuntimeHubStatus {
    return {
      role: this.role,
      peerId: this.peerId,
      epoch: this.election?.getEpoch() ?? 0,
      canDrain: this.election ? this.election.canDrain() : this.role === "solo",
    };
  }

  isLeader(): boolean {
    return this.role === "leader" || this.role === "solo";
  }

  subscribe(listener: RoleListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const status = this.getStatus();
    for (const l of this.listeners) l(status);
  }
}

let singleton: AgentRuntimeHub | null = null;
let singletonPromise: Promise<AgentRuntimeHub> | null = null;

/** Create/get hub; caller should `setRoleHandlers` then `start()`. */
export async function getAgentRuntimeHub(): Promise<AgentRuntimeHub> {
  if (singleton) return singleton;
  if (!singletonPromise) {
    singletonPromise = AgentRuntimeHub.create().then(h => {
      singleton = h;
      return h;
    });
  }
  return singletonPromise;
}

/** Test / HMR reset. */
export async function resetAgentRuntimeHub(): Promise<void> {
  if (singleton) await singleton.stop();
  singleton = null;
  singletonPromise = null;
}
