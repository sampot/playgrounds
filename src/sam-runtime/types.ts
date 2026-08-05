/**
 * Portable SAM runtime types (DEC-024 / DEC-031).
 */

export type SamFileMap = Record<string, string>;

/** Session protocol decl from `sam:protocol` (DEC-046 Phase 4; shape matches catalog). */
export interface SamHeadSessionProtocol {
  protocolId: string;
  apiVersion: string;
  roles?: string[];
}

export interface SamHeadMeta {
  title?: string;
  toolKinds?: string[];
  toolGlobs?: string[];
  needsController?: boolean;
  /**
   * First `sam:protocol` token’s protocolId (legacy convenience).
   * Prefer {@link sessionProtocols} for matching.
   */
  protocol?: string;
  /**
   * Parsed from `sam:protocol` (comma-separated tokens:
   * `id[@apiVersion][:role[+role…]]`; bare id ⇒ apiVersion `"1"`).
   */
  sessionProtocols?: SamHeadSessionProtocol[];
  /** Environment capability tokens from `sam:capabilities` (DEC-036). */
  capabilities?: string[];
}

export interface ScheduleOptions {
  /** Fire once after delay. */
  delayMs?: number;
  /** Fire once at absolute epoch ms. */
  at?: number;
  /** Repeat every interval (ms); first fire after same interval unless delayMs/at set. */
  intervalMs?: number;
}

export interface SamSendOptions {
  to: string;
  type: string;
  payload?: unknown;
  id?: string;
  replyTo?: string;
}

export interface SamSpawnResult {
  sandboxId: string;
  agentId: string;
}

export interface SamExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  schedule(options: ScheduleOptions): { cancel: () => void };
  /** Enqueue to another agent (requires AgentRuntime). */
  send?(options: SamSendOptions): Promise<{ id: string }>;
  /** Enqueue to self (requires AgentRuntime). */
  sendSelf?(options: {
    type: string;
    payload?: unknown;
    id?: string;
    replyTo?: string;
  }): Promise<{ id: string }>;
}

/** Injected bindings (KV／DB／HOST／…)。不含 INFRA——Controller 不得經 functions 繞路。 */
export type SamEnv = Record<string, unknown>;

/** Mailbox message shape passed to onMessage (DEC-031). */
export interface SamControllerMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: unknown;
  replyTo?: string;
  sentAt: number;
  deliveryAttempts: number;
}

export interface ControllerHandler {
  fetch?(
    request: Request,
    env: SamEnv,
    ctx: SamExecutionContext
  ): Response | Promise<Response>;
  alarm?(env: SamEnv, ctx: SamExecutionContext): void | Promise<void>;
  onStart?(env: SamEnv, ctx: SamExecutionContext): void | Promise<void>;
  onStop?(env: SamEnv, ctx: SamExecutionContext): void | Promise<void>;
  onPause?(env: SamEnv, ctx: SamExecutionContext): void | Promise<void>;
  onResume?(env: SamEnv, ctx: SamExecutionContext): void | Promise<void>;
  onCommand?(
    command: unknown,
    env: SamEnv,
    ctx: SamExecutionContext
  ): unknown | Promise<unknown>;
  onMessage?(
    message: SamControllerMessage,
    env: SamEnv,
    ctx: SamExecutionContext
  ): void | Promise<void>;
}

export interface FunctionsHandler {
  fetch(
    request: Request,
    env: SamEnv,
    ctx: SamExecutionContext
  ): Response | Promise<Response>;
}

export const CONTROLLER_ENTRY = "controller.js";
export const FUNCTIONS_ENTRY = "functions.js";
export const INDEX_ENTRY = "index.html";

export interface LoadedEsmModule<T = unknown> {
  exports: T;
  dispose(): Promise<void>;
}

export type SamEsmLoader = <T = unknown>(
  files: SamFileMap,
  entryPath: string
) => Promise<LoadedEsmModule<T> | null>;
