/**
 * Backend Runtime message protocol (DEC-038).
 * Transport-agnostic shapes: MVP = Worker postMessage; future = WebRTC.
 */

import type { SerializedRequest, SerializedResponse } from "./canvasSwProtocol";
import type { FileMap } from "./projectTypes";
import type { ToolGrantMode } from "./toolGrant";

/** Grant snapshot for Backend Runtime functions env (DEC-037／038). */
export type DelegateGrantSnapshot = {
  hostSandboxId: string;
  paths: string[];
  mode: ToolGrantMode;
  focusPath?: string;
};

export type BackendRuntimeIn =
  | { type: "bootstrap"; leaderEpoch: number }
  | { type: "shutdown" }
  | {
      type: "secretsMaterial";
      /** Plaintext map while shell SecretStore is unlocked; empty clears. */
      secrets: Record<string, string>;
    }
  | {
      type: "functionsFetch";
      requestId: string;
      sandboxId: string;
      files: FileMap;
      request: SerializedRequest;
      activeAgentSandboxId: string | null;
      activeToolSandboxId: string | null;
      dotenvText: string | null;
      admittedCapabilities: string[] | null;
      injectHost: boolean;
      injectDelegate: boolean;
      injectSession: boolean;
      /** When injectDelegate: host grant for DELEGATE.DB／KV／getGrant (Runtime-local Durable). */
      delegateGrant?: DelegateGrantSnapshot | null;
    }
  | {
      type: "controllerAttach";
      requestId: string;
      sandboxId: string;
      files: FileMap;
      /** Steward seat gets env.HOST. */
      withHost: boolean;
      /** For fleet: active steward id (HOST only when sandboxId matches). */
      activeAgentSandboxId: string | null;
      injectSession?: boolean;
    }
  | {
      type: "controllerDetach";
      requestId: string;
      sandboxId: string;
    }
  | {
      type: "controllerDispatch";
      requestId: string;
      sandboxId: string;
      message: unknown;
    }
  | {
      type: "controllerCommand";
      requestId: string;
      sandboxId: string;
      command: unknown;
    }
  | {
      type: "controllerPause";
      requestId: string;
      sandboxId: string;
    }
  | {
      type: "controllerResume";
      requestId: string;
      sandboxId: string;
    }
  | {
      type: "controllerSyncFiles";
      requestId: string;
      sandboxId: string;
      files: FileMap;
    }
  | {
      type: "fsOp";
      requestId: string;
      op: string;
      args: unknown[];
    }
  /** Shell holds exclusive OPFS access (e.g. WASI SyncAccessHandle run). */
  | { type: "fsHold"; requestId: string; sandboxId: string }
  | { type: "fsRelease"; requestId: string; sandboxId: string }
  | {
      type: "drainGate";
      canDrain: boolean;
      isLeader: boolean;
      epoch: number;
    }
  | { type: "kickDrain" }
  | {
      type: "envRpcResult";
      rpcId: string;
      ok: boolean;
      result?: unknown;
      error?: { code?: string; message: string };
    }
  | {
      type: "runtimeRpcResult";
      rpcId: string;
      ok: boolean;
      result?: unknown;
      error?: { code?: string; message: string };
    };

export type BackendRuntimeOut =
  | { type: "ready" }
  | { type: "bootstrapped"; leaderEpoch: number }
  | { type: "shutdownAck" }
  | { type: "secretsMaterialAck" }
  | {
      type: "functionsFetchResult";
      requestId: string;
      ok: true;
      response: SerializedResponse;
    }
  | {
      type: "functionsFetchResult";
      requestId: string;
      ok: false;
      error: string;
    }
  | {
      type: "controllerResult";
      requestId: string;
      ok: true;
      result?: unknown;
    }
  | {
      type: "controllerResult";
      requestId: string;
      ok: false;
      error: string;
      code?: string;
    }
  | {
      type: "fsOpResult";
      requestId: string;
      ok: true;
      result?: unknown;
    }
  | {
      type: "fsOpResult";
      requestId: string;
      ok: false;
      error: string;
      code?: string;
    }
  | { type: "fsHoldAck"; requestId: string }
  | { type: "fsReleaseAck"; requestId: string }
  | {
      type: "fsChanged";
      sandboxId: string;
      op: "write" | "mkdir" | "remove";
      path: string;
      content?: string;
    }
  | {
      type: "envRpc";
      rpcId: string;
      binding: "HOST" | "DELEGATE" | "SESSION";
      sandboxId: string;
      method: string;
      args: unknown[];
    }
  | {
      type: "runtimeRpc";
      rpcId: string;
      method: "send" | "sendSelf" | "schedule" | "scheduleCancel";
      args: unknown[];
    };

export function isBackendRuntimeOut(data: unknown): data is BackendRuntimeOut {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    typeof (data as { type: unknown }).type === "string"
  );
}
