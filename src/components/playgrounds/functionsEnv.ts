/**
 * Compose `env` for Playgrounds functions.js
 * (DEC-016 / DEC-017 / DEC-020 / DEC-022 / DEC-023 / DEC-029 / DEC-035 / DEC-036 / DEC-037 / DEC-051).
 */

import { getAdmittedCapabilities } from "./admittedCapabilities";
import { createComputeBinding } from "./computeBridge";
import { createEnvVarsNamespace, readDotEnvTextFromFiles } from "./dotenvParse";
import { wrapHostBindingWithCaller } from "./hostAccessGate";
import { createHostBinding, getHostBridge } from "./hostBridge";
import { admitsHostBinding } from "./hostScopeMap";
import { createMockDb } from "./mockDb";
import { createMockKvNamespace } from "./mockKv";
import {
  admitsCompute,
  admitsSecretsGet,
  effectiveCapabilities,
} from "./samCapabilities";
import { createSecretBindingsForEnv } from "./secretStore";
import {
  createSessionBinding,
  getSessionSeatIdForProject,
} from "./sessionBridge";
import { createScopedHostBinding } from "./scopedHostBinding";
import {
  createDelegateBinding,
  getScopedDelegateHost,
  getToolBridge,
} from "./toolBridge";
import { getDelegateGrant } from "./delegateGrantRegistry";

export interface CreateFunctionsEnvOptions {
  /** Inject full env.HOST when this matches sandboxId (steward seat). */
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
   * Admitted environment capabilities (DEC-036／051). When omitted, uses the
   * in-memory admit registry (hydrated from ProjectMeta).
   */
  admittedCapabilities?: readonly string[] | null;
}

/**
 * Build the default `env` object for a project's functions.js.
 * HOST：對口席＝全量；已準入 scopes＝同形子集（DEC-051）。
 * DELEGATE（＋歷史別名 TOOL）：委派／工具 session 且 bridge 已註冊（DEC-037）。
 * SESSION：多方 session 入座（DEC-023）。
 * DEC-035：`env.vars`／`env.secrets.*`；委派沙盒 vars 來自自身樹、secrets 為空。
 * DEC-036／051：`env.COMPUTE` 遷移雙掛；`secrets:get` 才注入密鑰值 binding。
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
  const isSteward = Boolean(
    agentId && sandboxId === agentId && getHostBridge()
  );
  const seated = Boolean(
    options.injectSession !== false && getSessionSeatIdForProject(sandboxId)
  );

  const admitted =
    options.admittedCapabilities !== undefined
      ? options.admittedCapabilities
      : getAdmittedCapabilities(sandboxId);
  const effective = effectiveCapabilities({
    admitted,
    isSteward,
  });

  if (isDelegate) {
    const delegate = createDelegateBinding(sandboxId);
    env.DELEGATE = delegate;
    /** @deprecated historical alias (DEC-037) */
    env.TOOL = delegate;
  } else if (isSteward) {
    env.HOST = wrapHostBindingWithCaller(
      createHostBinding() as unknown as Record<string, unknown>,
      sandboxId
    );
  } else if (admitsHostBinding(effective) && getHostBridge()) {
    env.HOST = wrapHostBindingWithCaller(
      createScopedHostBinding(
        createHostBinding() as unknown as Record<string, unknown>,
        { effectiveScopes: effective }
      ),
      sandboxId
    );
  }
  if (seated) {
    env.SESSION = createSessionBinding(sandboxId);
  }

  if (admitsCompute(effective)) {
    env.COMPUTE = createComputeBinding(sandboxId, effective);
  }

  // DEC-029／035／051: per-secret bindings only with secrets:get (steward auto-has it).
  if (!isDelegate && admitsSecretsGet(effective)) {
    env.secrets = Object.freeze({ ...createSecretBindingsForEnv() });
  }

  return env;
}
