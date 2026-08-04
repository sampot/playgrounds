/**
 * Compose `env` for Playgrounds functions.js
 * (DEC-016 / DEC-017 / DEC-020 / DEC-022 / DEC-023 / DEC-029 / DEC-035 / DEC-036 / DEC-037).
 */

import { getAdmittedCapabilities } from "./admittedCapabilities";
import { createComputeBinding } from "./computeBridge";
import { createEnvVarsNamespace, readDotEnvTextFromFiles } from "./dotenvParse";
import { createHostBinding, getHostBridge } from "./hostBridge";
import { createMockDb } from "./mockDb";
import { createMockKvNamespace } from "./mockKv";
import { admitsCompute } from "./samCapabilities";
import { createSecretBindingsForEnv } from "./secretStore";
import {
  createSessionBinding,
  getSessionSeatIdForProject,
} from "./sessionBridge";
import {
  createDelegateBinding,
  getScopedDelegateHost,
  getToolBridge,
} from "./toolBridge";
import { getDelegateGrant } from "./delegateGrantRegistry";

export interface CreateFunctionsEnvOptions {
  /** Inject env.HOST only when this matches sandboxId. */
  activeAgentSandboxId?: string | null;
  /** Inject env.DELEGATE (＋legacy TOOL) when this matches sandboxId (delegate session). */
  activeToolSandboxId?: string | null;
  /**
   * When true (default), inject env.SESSION if sandboxId is a seated participant.
   * Shell uses the seat registry; pass false only for internal Host authority calls
   * that already omit seat registration.
   */
  injectSession?: boolean;
  /**
   * Sandbox root `.env` text → `env.vars` (DEC-035).
   * Prefer this or `files`; missing → empty `env.vars`.
   */
  dotenvText?: string | null;
  /** File map; used to read `.env` when `dotenvText` is omitted. */
  files?: Record<string, unknown> | null;
  /**
   * Admitted environment capabilities (DEC-036). When omitted, uses the
   * in-memory admit registry (hydrated from ProjectMeta).
   */
  admittedCapabilities?: readonly string[] | null;
}

/**
 * Build the default `env` object for a project's functions.js.
 * HOST：現行總管且 bridge 已註冊。
 * DELEGATE（＋歷史別名 TOOL）：委派／工具 session 且 bridge 已註冊（DEC-037）。
 * SESSION：多方 session 入座（DEC-023）。
 * DEC-035：`env.vars`／`env.secrets.*`；委派沙盒 vars 來自自身樹、secrets 為空。
 * 入座工人可有 secrets（BYOK）；SESSION 物件不帶密鑰。
 * DEC-036：`env.COMPUTE` 與準入正交。
 * 同 id 兼 tool＋agent（MVP 禁止）時 DELEGATE 優先、省略 HOST。
 */
export function createFunctionsEnv(
  sandboxId: string,
  options: CreateFunctionsEnvOptions = {}
): Record<string, unknown> {
  const dotenvText =
    options.dotenvText !== undefined
      ? options.dotenvText
      : readDotEnvTextFromFiles(options.files);
  const env: Record<string, unknown> = {
    KV: createMockKvNamespace(sandboxId),
    DB: createMockDb(sandboxId),
    vars: createEnvVarsNamespace(dotenvText),
    secrets: Object.freeze({}) as Readonly<Record<string, unknown>>,
  };
  const toolId = options.activeToolSandboxId ?? null;
  const agentId = options.activeAgentSandboxId ?? null;
  const registryGrant = getDelegateGrant(sandboxId);
  const bridgeReady = Boolean(getToolBridge() || getScopedDelegateHost());
  // Registry covers Tool tab + worker grants (DEC-037); bridge optional for local DB.
  const isDelegate = Boolean(
    registryGrant || (bridgeReady && toolId && sandboxId === toolId)
  );
  const isActiveAgent = Boolean(
    agentId && sandboxId === agentId && getHostBridge()
  );
  const seated = Boolean(
    options.injectSession !== false && getSessionSeatIdForProject(sandboxId)
  );

  if (isDelegate) {
    const delegate = createDelegateBinding(sandboxId);
    env.DELEGATE = delegate;
    /** @deprecated historical alias (DEC-037) */
    env.TOOL = delegate;
  } else if (isActiveAgent) {
    env.HOST = createHostBinding();
  }
  if (seated) {
    env.SESSION = createSessionBinding(sandboxId);
  }

  const admitted =
    options.admittedCapabilities !== undefined
      ? options.admittedCapabilities
      : getAdmittedCapabilities(sandboxId);
  if (admitsCompute(admitted)) {
    env.COMPUTE = createComputeBinding(sandboxId, admitted ?? []);
  }

  // DEC-029／035: per-secret bindings under env.secrets (no bag, no top-level).
  if (!isDelegate) {
    env.secrets = Object.freeze({ ...createSecretBindingsForEnv() });
  }

  return env;
}
