/**
 * Shell-registered delegate API for a mounted Tool SAM / worker (DEC-022／037).
 * Injected as env.DELEGATE (and legacy env.TOOL) when grant session is active.
 */

import {
  DELEGATE_API_VERSION,
  DELEGATE_CAPABILITIES,
  TOOL_API_VERSION,
  TOOL_CAPABILITIES,
  type DelegateCapability,
  type ToolCapability,
} from "./toolCapabilities";
import type { ToolGrant, ToolGrantMode, ToolSession } from "./toolGrant";
import type { DbDatabase } from "./mockDb";
import type { MockKvNamespace } from "./mockKv";

export class ToolBridgeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ToolBridgeError";
    this.code = code;
  }
}

export interface ToolWriteFileOptions {
  expectedHash?: string;
}

export interface ToolBridge {
  apiVersion(): Promise<string>;
  capabilities(): Promise<DelegateCapability[]>;
  getGrant(): Promise<{
    hostSandboxId: string;
    paths: string[];
    mode: ToolGrantMode;
    focusPath?: string;
  }>;
  readFile(path: string): Promise<{
    path: string;
    content: string;
    encoding: "utf-8";
    hash: string;
  }>;
  writeFile(
    path: string,
    content: string,
    options?: ToolWriteFileOptions
  ): Promise<{ path: string; hash: string }>;
  readFileBase64(path: string): Promise<{
    path: string;
    base64: string;
    encoding: "base64";
    byteLength: number;
    hash: string;
  }>;
  writeFileBase64(
    path: string,
    base64: string
  ): Promise<{ path: string; byteLength: number; hash: string }>;
  close(options?: { dirty?: boolean }): Promise<{ ok: true }>;
  readonly DB?: DbDatabase;
  readonly KV?: MockKvNamespace;
}

export type ScopedDelegateHost = {
  forSandbox: (sandboxId: string) => ToolBridge;
};

let bridge: ToolBridge | null = null;
let scopedHost: ScopedDelegateHost | null = null;

export function registerToolBridge(impl: ToolBridge | null): void {
  bridge = impl;
}

export function registerScopedDelegateHost(
  host: ScopedDelegateHost | null
): void {
  scopedHost = host;
}

export function getToolBridge(): ToolBridge | null {
  return bridge;
}

export function getScopedDelegateHost(): ScopedDelegateHost | null {
  return scopedHost;
}

/** Legacy unscoped proxy (foreground tool session). */
export function createToolBinding(): ToolBridge {
  return {
    apiVersion: async () => requireBridge().apiVersion(),
    capabilities: async () => requireBridge().capabilities(),
    getGrant: async () => requireBridge().getGrant(),
    readFile: async (...args) => requireBridge().readFile(...args),
    writeFile: async (...args) => requireBridge().writeFile(...args),
    readFileBase64: async (...args) => requireBridge().readFileBase64(...args),
    writeFileBase64: async (...args) =>
      requireBridge().writeFileBase64(...args),
    close: async (...args) => requireBridge().close(...args),
    get DB() {
      return requireBridge().DB;
    },
    get KV() {
      return requireBridge().KV;
    },
  };
}

/**
 * Per-sandbox delegate binding (DEC-037). Prefer this for functionsEnv injection.
 */
export function createDelegateBinding(sandboxId: string): ToolBridge {
  if (scopedHost) {
    return scopedHost.forSandbox(sandboxId);
  }
  return createToolBinding();
}

function requireBridge(): ToolBridge {
  if (!bridge) {
    throw new ToolBridgeError(
      "grant_inactive",
      "Playgrounds delegate bridge 尚未就緒或無委派 session"
    );
  }
  return bridge;
}

export type { ToolGrant, ToolSession, DelegateCapability, ToolCapability };
export {
  DELEGATE_API_VERSION,
  DELEGATE_CAPABILITIES,
  TOOL_API_VERSION,
  TOOL_CAPABILITIES,
};
