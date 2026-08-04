/**
 * Portable SAM runtime (browser-safe entry — no node:fs).
 * Node ESM loader: `import { loadEsmFromFileMap } from "./node.ts"`.
 */

export {
  CONTROLLER_ENTRY,
  FUNCTIONS_ENTRY,
  INDEX_ENTRY,
  type ControllerHandler,
  type FunctionsHandler,
  type LoadedEsmModule,
  type SamControllerMessage,
  type SamEnv,
  type SamEsmLoader,
  type SamExecutionContext,
  type SamFileMap,
  type SamHeadMeta,
  type SamSendOptions,
  type SamSpawnResult,
  type ScheduleOptions,
} from "./types.ts";
export { parseSamHead, resolveSamMeta } from "./parseSamHead.ts";
export { SamScheduler } from "./scheduler.ts";
export { SamInstance, type SamInstanceOptions } from "./instance.ts";
export { createMemoryKv, createHostStub, type MemoryKv } from "./bindings.ts";
export {
  N_MAX_ATTEMPTS,
  MAILBOX_CAPACITY,
  DEDUPE_WINDOW_SIZE,
  RETRY_DELAY_MS,
  T_HEARTBEAT_MS,
  T_BUFFER_MS,
  T_TAKEOVER_MS,
  T_SELF_CHECK_MS,
  PLAYGROUNDS_AGENT_LEADER_LOCK,
  LEADER_STATE_KEY,
} from "./constants.ts";
export { AgentRuntimeError, type AgentRuntimeErrorCode } from "./errors.ts";
export { createMemoryStorage, type RuntimeStorage } from "./storage.ts";
export {
  createAgentMessage,
  newMessageId,
  type AgentMessage,
} from "./message.ts";
export {
  MailboxStore,
  type MailboxSummary,
  type MailboxMessageHeader,
} from "./mailboxStore.ts";
export { AlarmStore } from "./alarmStore.ts";
export {
  AgentRegistry,
  type AgentRegistryEntry,
  type AgentRegistryStatus,
} from "./registry.ts";
export { drainAgent } from "./drainLoop.ts";
export {
  AgentRuntime,
  type AgentRuntimeOptions,
  type SpawnOptions,
} from "./runtime.ts";
export {
  LeaderElection,
  type LeaderElectionOptions,
  type LeaderRole,
} from "./leaderElection.ts";
export { LeaderStore, type LeaderState } from "./leaderStore.ts";
export {
  FakeLockManager,
  createWebLockRequest,
  type LeaderLockHandle,
  type LeaderLockRequest,
} from "./leaderLock.ts";
export { FakeClock, realClock, type LeaderClock } from "./leaderClock.ts";
