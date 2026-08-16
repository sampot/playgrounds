/**
 * Playgrounds UI SDK — TypeScript surface for `window.PG`.
 *
 * Mirrors `public/playgrounds/sdk.js` (the runtime) and the
 * `PG-UI-SDK-SPEC.md` §3 contract. This file is non-breaking: the
 * runtime `window.PG` is `any` at runtime, but strongly-typed SAMs
 * (or `// @ts-check` JS) can `/** @type {PgSdk} */ (window.PG)` to
 * get editor IntelliSense.
 *
 * Tests in `tests/sdkDts.test.ts` pin the contract here so a drift
 * between this declaration and the runtime is caught at CI time.
 */

interface PgSdk {
  readonly version: string;
  /** Intrinsic: always mounted. */
  readonly kv: PgKv;
  readonly db: PgDb;
  readonly vars: PgVars;
  /** Capabilities: mounted only when admitted (`"SESSION" in PG === true`). */
  readonly SESSION?: PgSession;
  readonly COMPUTE?: PgCompute;
  readonly DELEGATE?: PgDelegate;
  readonly HOST?: PgHost;
  /** Resolves once capabilities+vars have been populated. */
  readonly ready: Promise<void>;
  /** Debug: list the capabilities mounted on this PG. */
  readonly capabilities(): Promise<ReadonlyArray<PgCapability>>;
  /** Escape hatch: custom /api/* route (SAM-supplied functions.js). */
  fetch(path: string, init?: RequestInit): Promise<Response>;
}

type PgCapability =
  | "kv" | "db" | "vars"
  | "session" | "compute" | "delegate" | "host";

interface PgKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts?: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: Array<{ name: string; expiration?: number }>;
    cursor?: string;
    list_complete: boolean;
  }>;
}

interface PgDb {
  prepare(sql: string): PgDbStatement;
  batch(statements: ReadonlyArray<unknown>): Promise<unknown>;
  exec(sql: string): Promise<void>;
}

interface PgDbStatement {
  bind(...args: unknown[]): PgDbStatement;
  all<T = unknown>(): Promise<T[]>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ changes: number; last_insert_rowid?: number }>;
  raw<T = unknown>(): Promise<T[]>;
}

interface PgVars {
  readonly [key: string]: string | undefined;
  keys(): ReadonlyArray<string>;
  has(key: string): boolean;
}

interface PgSession {
  capabilities(): Promise<ReadonlyArray<string>>;
  subscribe?(handler: (event: SessionEvent) => void): () => void;
  act?(input: { type: string; payload?: unknown }): Promise<unknown>;
  getState?(): Promise<unknown>;
}

interface SessionEvent {
  type: string;
  payload?: unknown;
}

interface PgCompute {
  apiVersion(): Promise<string>;
  capabilities(): Promise<ReadonlyArray<string>>;
  runPython(options: HostPythonRunOptions): Promise<HostPythonRunResult>;
  runCmd?(options: HostCmdRunOptions): Promise<HostCmdRunResult>;
}

interface HostPythonRunOptions {
  code: string;
  /** Optional timeout in ms. */
  timeoutMs?: number;
}

interface HostPythonRunResult {
  stdout: string;
  stderr: string;
  result?: unknown;
}

interface HostCmdRunOptions {
  cmd: string;
  args?: ReadonlyArray<string>;
  cwd?: string;
  timeoutMs?: number;
}

interface HostCmdRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface PgDelegate {
  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string | Uint8Array): Promise<void>;
    list(path: string): Promise<Array<{ name: string; kind: "file" | "dir" }>>;
    mkdir(path: string): Promise<void>;
    remove(path: string): Promise<void>;
  };
  grant(): Promise<ReadonlyArray<{ sandboxId: string; mode: "read" | "readwrite" }>>;
}

interface PgHost {
  capabilities(): Promise<ReadonlyArray<string>>;
  /** Methods are dynamic per-Runtime; the index signature captures that. */
  [method: string]:
    | ((...args: unknown[]) => Promise<unknown>)
    | undefined;
}

interface PgError extends Error {
  code:
    | "capability_not_granted"
    | "binding_unavailable"
    | "kv_key_too_large"
    | "db_sql_error"
    | "secrets_locked"
    | "session_not_seated"
    | "functions_unavailable"
    | "functions_no_leader"
    | "internal_error";
  status: number;
  upstream?: { code?: string; message?: string };
}

declare global {
  interface Window {
    /**
     * Playgrounds UI SDK; pure `fetch("/api/...")` wrapper. Absent on
     * the shell page (not inside a canvas) or when the host has not
     * injected the script.
     */
    PG: PgSdk;
  }
}

/**
 * Optional SAM → shell (iframe `parent.postMessage`) for session chat hints.
 * Same contract on play and go. See `rosterSessionChat` / PG-GO-SESSION-CHAT-PLAN.
 *
 * @example
 * parent.postMessage({
 *   type: "playgrounds-session-chat-hints",
 *   freeText: false,
 *   quickReplies: ["加油", "等一下"],
 * }, "*");
 */
type PlaygroundsSessionChatHintsMessage = {
  type: "playgrounds-session-chat-hints";
  freeText?: boolean;
  quickReplies?: string[];
  /** Nested form also accepted by the shell parser. */
  hints?: { freeText?: boolean; quickReplies?: string[] };
};

export {};
