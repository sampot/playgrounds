/**
 * Create async method proxies that RPC to the shell over the Backend Runtime channel.
 */

import { hashBytes, hashUtf8 } from "./contentHash";
import { fileContentToUtf8 } from "./hostBridge";
import { bytesToBase64 } from "./hostBinary";
import { isHostShellMethod } from "./hostMethodSurface";
import { normalizeProjectPath, sortProjectPaths } from "./pathUtils";
import {
  createRuntimeLocalFsHandlers,
  type FsChangedEvent,
} from "./runtimeLocalHostFs";
import { isBinaryContent, isTextContent, type FileMap } from "./projectTypes";

type RpcFn = (
  binding: "HOST" | "DELEGATE" | "SESSION",
  method: string,
  args: unknown[]
) => Promise<unknown>;

function makeMethodProxy(
  rpc: RpcFn,
  binding: "HOST" | "DELEGATE" | "SESSION",
  method: string
) {
  return (...args: unknown[]) => rpc(binding, method, args);
}

export type SplitHostBindingOptions = {
  /** Binding sandbox (snapshot owner); required for local FS writes. */
  sandboxId?: string;
  activeAgentSandboxId?: string | null;
  /** Persist writeFile／mkdir／remove via Runtime OPFS (Worker). */
  persistLocalWrites?: boolean;
  onFsChanged?: (ev: FsChangedEvent) => void;
  /** Await exclusive OPFS holders before Runtime-local FS access. */
  beforeFsAccess?: () => Promise<void>;
};

/** HOST methods served entirely in Runtime (no envRpc). */
export const RUNTIME_LOCAL_HOST_METHODS = new Set([
  "readFile",
  "listFiles",
  "readFileBase64",
  "writeFile",
  "writeFileBase64",
  "mkdir",
  "remove",
  "listDir",
]);

/**
 * HOST：shell-face → RPC；FS 讀寫在 Runtime 本地（DEC-038）；其餘 local 暫 RPC。
 */
export function createSplitHostBinding(
  rpc: RpcFn,
  files: FileMap,
  options: SplitHostBindingOptions = {}
): Record<string, unknown> {
  const snapshot = files;

  const localReadFile = async (path: string, _sandboxId?: string) => {
    const norm = normalizeProjectPath(path);
    if (!norm) throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
    const content = snapshot[norm];
    if (content === undefined) {
      throw Object.assign(new Error(`找不到檔案：${norm}`), {
        code: "not_found",
      });
    }
    if (isBinaryContent(content)) {
      throw Object.assign(
        new Error(`檔案為二進位，HOST.readFile 僅支援文字：${norm}`),
        { code: "binary" }
      );
    }
    const text = fileContentToUtf8(content);
    return {
      path: norm,
      content: text,
      encoding: "utf-8" as const,
      hash: await hashUtf8(text),
    };
  };

  const localListFiles = async (_sandboxId?: string) =>
    sortProjectPaths(Object.keys(snapshot));

  const localReadFileBase64 = async (path: string, _sandboxId?: string) => {
    const norm = normalizeProjectPath(path);
    if (!norm) throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
    const content = snapshot[norm];
    if (content === undefined) {
      throw Object.assign(new Error(`找不到檔案：${norm}`), {
        code: "not_found",
      });
    }
    const bytes = isTextContent(content)
      ? new TextEncoder().encode(content)
      : content;
    return {
      path: norm,
      base64: bytesToBase64(bytes),
      encoding: "base64" as const,
      byteLength: bytes.byteLength,
      hash: await hashBytes(bytes),
    };
  };

  const localHandlers: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  > = {
    readFile: (path, sandboxId) =>
      localReadFile(String(path), sandboxId as string | undefined),
    listFiles: sandboxId => localListFiles(sandboxId as string | undefined),
    readFileBase64: (path, sandboxId) =>
      localReadFileBase64(String(path), sandboxId as string | undefined),
  };

  if (options.persistLocalWrites && options.sandboxId) {
    Object.assign(
      localHandlers,
      createRuntimeLocalFsHandlers({
        files: snapshot,
        sandboxId: options.sandboxId,
        activeAgentSandboxId: options.activeAgentSandboxId ?? null,
        onFsChanged: options.onFsChanged,
        beforeFsAccess: options.beforeFsAccess,
      })
    );
  }

  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (isHostShellMethod(prop)) {
          return makeMethodProxy(rpc, "HOST", prop);
        }
        const local = localHandlers[prop];
        if (local) return local;
        return makeMethodProxy(rpc, "HOST", prop);
      },
    }
  );
}

/** @deprecated prefer createSplitHostBinding with files snapshot */
export function createRpcHostBinding(rpc: RpcFn): Record<string, unknown> {
  return createSplitHostBinding(rpc, {});
}

export function createRpcDelegateBinding(rpc: RpcFn): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        return makeMethodProxy(rpc, "DELEGATE", prop);
      },
    }
  );
}

/**
 * DELEGATE for Backend Runtime：FS／close／capabilities 經 RPC；
 * getGrant 可本地回傳；DB／KV 親和 Runtime（host sandbox Durable）。
 */
export function createRpcDelegateBindingWithGrant(
  rpc: RpcFn,
  grant: {
    hostSandboxId: string;
    paths: string[];
    mode: "read" | "readwrite";
    focusPath?: string;
  },
  durable: {
    DB?: unknown;
    KV?: unknown;
  } = {}
): Record<string, unknown> {
  const grantPayload = {
    hostSandboxId: grant.hostSandboxId,
    paths: [...grant.paths],
    mode: grant.mode,
    ...(grant.focusPath ? { focusPath: grant.focusPath } : {}),
  };
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        if (prop === "DB") return durable.DB;
        if (prop === "KV") return durable.KV;
        if (prop === "getGrant") {
          return async () => ({ ...grantPayload });
        }
        return makeMethodProxy(rpc, "DELEGATE", prop);
      },
    }
  );
}

export function createRpcSessionBinding(rpc: RpcFn): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop !== "string" || prop === "then") return undefined;
        return makeMethodProxy(rpc, "SESSION", prop);
      },
    }
  );
}

/** env.secrets from Runtime in-memory material (no per-get RPC). */
export function createCachedSecretsNamespace(
  getMaterial: () => Map<string, string>
): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get(_t, name) {
        if (typeof name !== "string" || name === "then") return undefined;
        return {
          async get(): Promise<string> {
            const cache = getMaterial();
            if (!cache.has(name)) {
              const err = new Error(
                cache.size === 0 ? "secret_locked" : "secret_not_found"
              ) as Error & { code?: string };
              err.code =
                cache.size === 0 ? "secret_locked" : "secret_not_found";
              throw err;
            }
            return cache.get(name)!;
          },
        };
      },
    }
  );
}
