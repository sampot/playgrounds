/**
 * Shell implementation of env.DELEGATE (DEC-022／037): grant-scoped FS +
 * optional host DB／KV via `.bindings/db`｜`.bindings/kv`.
 *
 * Supports multiple concurrent delegates via forSandbox(sandboxId).
 */

import { hashBytes, hashUtf8 } from "./contentHash";
import { assertBinarySize, base64ToBytes, bytesToBase64 } from "./hostBinary";
import { fileContentToUtf8 } from "./hostBridge";
import { isBinaryContent, type FileContent } from "./fileContent";
import { createMockDb } from "./mockDb";
import { createMockKvNamespace, type MockKvNamespace } from "./mockKv";
import { loadProjectFiles, saveFile } from "./sandboxAuthority";
import {
  DELEGATE_API_VERSION,
  DELEGATE_CAPABILITIES,
  ToolBridgeError,
  type ToolBridge,
  type ToolWriteFileOptions,
} from "./toolBridge";
import {
  assertPathAllowed,
  grantAllowsBinding,
  ToolGrantError,
  type ToolSession,
} from "./toolGrant";

export interface ShellToolBridgeContext {
  /**
   * Resolve grant session for a delegate sandbox id (Tool tab or worker).
   * Preferred API (DEC-037 multi-delegate).
   */
  getSessionFor: (sandboxId: string) => ToolSession | null;
  /**
   * Foreground Tool session (legacy single-session callers / tests).
   * Default: first non-null from getSessionFor is not used — callers should set.
   */
  getSession?: () => ToolSession | null;
  getActiveId: () => string | null;
  getActiveAgentId: () => string | null;
  getHostFiles?: () => Record<string, FileContent>;
  /** Optional: load files for an arbitrary host sandbox id. */
  getFilesForHost?: (
    hostSandboxId: string
  ) => Record<string, FileContent> | null;
  patchHostFile: (path: string, content: FileContent) => Promise<void>;
  closeToolSession: () => void | Promise<void>;
}

export type ShellToolBridge = ToolBridge & {
  forSandbox: (sandboxId: string) => ToolBridge;
};

function mapGrantError(e: unknown): never {
  if (e instanceof ToolGrantError) {
    throw new ToolBridgeError(e.code, e.message);
  }
  throw e;
}

function resolveSession(
  ctx: ShellToolBridgeContext,
  sandboxId?: string
): ToolSession | null {
  if (sandboxId) return ctx.getSessionFor(sandboxId);
  if (ctx.getSession) return ctx.getSession();
  return null;
}

function requireSession(
  ctx: ShellToolBridgeContext,
  sandboxId?: string
): ToolSession {
  const session = resolveSession(ctx, sandboxId);
  if (!session) {
    throw new ToolBridgeError(
      "grant_inactive",
      "目前沒有有效的委派 grant session"
    );
  }
  return session;
}

function assertHostWritable(ctx: ShellToolBridgeContext, hostId: string): void {
  const agentId = ctx.getActiveAgentId();
  if (agentId && hostId === agentId) {
    throw new ToolBridgeError("forbidden", "不可對總管沙盒經委派寫入");
  }
}

async function loadHostFiles(
  ctx: ShellToolBridgeContext,
  hostId: string
): Promise<Record<string, FileContent>> {
  const activeId = ctx.getActiveId();
  if (activeId === hostId && ctx.getHostFiles) {
    return ctx.getHostFiles();
  }
  const mapped = ctx.getFilesForHost?.(hostId);
  if (mapped) return mapped;
  return loadProjectFiles(hostId);
}

function mapHostBinaryError(e: unknown): never {
  if (e && typeof e === "object" && "code" in e && e instanceof Error) {
    throw new ToolBridgeError(String((e as { code: unknown }).code), e.message);
  }
  throw e;
}

function wrapKvForMode(
  kv: MockKvNamespace,
  mode: "read" | "readwrite"
): MockKvNamespace {
  if (mode === "readwrite") return kv;
  return {
    get: (key, type) => kv.get(key, type),
    list: options => kv.list(options),
    put: async () => {
      throw new ToolBridgeError("forbidden", "授權為唯讀，不可寫入 KV");
    },
    delete: async () => {
      throw new ToolBridgeError("forbidden", "授權為唯讀，不可刪除 KV");
    },
  };
}

function buildBinding(
  ctx: ShellToolBridgeContext,
  sandboxId?: string
): ToolBridge {
  return {
    async apiVersion() {
      return DELEGATE_API_VERSION;
    },

    async capabilities() {
      const session = resolveSession(ctx, sandboxId);
      const caps = DELEGATE_CAPABILITIES.filter(c => {
        if (c === "db") {
          return Boolean(session && grantAllowsBinding(session.grant, "db"));
        }
        if (c === "kv") {
          return Boolean(session && grantAllowsBinding(session.grant, "kv"));
        }
        return true;
      });
      return [...caps];
    },

    async getGrant() {
      const session = requireSession(ctx, sandboxId);
      return {
        hostSandboxId: session.grant.hostSandboxId,
        paths: [...session.grant.paths],
        mode: session.grant.mode,
        ...(session.focusPath ? { focusPath: session.focusPath } : {}),
      };
    },

    async readFile(path: string) {
      const session = requireSession(ctx, sandboxId);
      let norm: string;
      try {
        norm = assertPathAllowed(session.grant, path, "read");
      } catch (e) {
        mapGrantError(e);
      }
      const files = await loadHostFiles(ctx, session.grant.hostSandboxId);
      const content = files[norm!];
      if (content === undefined) {
        throw new ToolBridgeError("not_found", `找不到檔案：${norm}`);
      }
      if (isBinaryContent(content)) {
        throw new ToolBridgeError(
          "binary",
          `檔案為二進位，請用 readFileBase64：${norm}`
        );
      }
      const text = fileContentToUtf8(content);
      return {
        path: norm!,
        content: text,
        encoding: "utf-8" as const,
        hash: await hashUtf8(text),
      };
    },

    async writeFile(
      path: string,
      content: string,
      options?: ToolWriteFileOptions
    ) {
      const session = requireSession(ctx, sandboxId);
      assertHostWritable(ctx, session.grant.hostSandboxId);
      let norm: string;
      try {
        norm = assertPathAllowed(session.grant, path, "write");
      } catch (e) {
        mapGrantError(e);
      }
      if (options?.expectedHash) {
        const files = await loadHostFiles(ctx, session.grant.hostSandboxId);
        const existing = files[norm!];
        if (existing !== undefined && !isBinaryContent(existing)) {
          const currentHash = await hashUtf8(fileContentToUtf8(existing));
          if (currentHash !== options.expectedHash) {
            throw new ToolBridgeError(
              "conflict",
              `檔案內容已變更（expectedHash 不符）：${norm}`
            );
          }
        } else if (existing === undefined) {
          throw new ToolBridgeError(
            "conflict",
            `檔案不存在，無法套用 expectedHash：${norm}`
          );
        } else {
          throw new ToolBridgeError(
            "binary",
            `檔案為二進位，無法以 expectedHash 覆寫：${norm}`
          );
        }
      }
      const hostId = session.grant.hostSandboxId;
      if (hostId === ctx.getActiveId()) {
        await ctx.patchHostFile(norm!, content);
      } else {
        await saveFile(hostId, norm!, content);
      }
      return { path: norm!, hash: await hashUtf8(content) };
    },

    async readFileBase64(path: string) {
      const session = requireSession(ctx, sandboxId);
      let norm: string;
      try {
        norm = assertPathAllowed(session.grant, path, "read");
      } catch (e) {
        mapGrantError(e);
      }
      const files = await loadHostFiles(ctx, session.grant.hostSandboxId);
      const content = files[norm!];
      if (content === undefined) {
        throw new ToolBridgeError("not_found", `找不到檔案：${norm}`);
      }
      const bytes =
        typeof content === "string"
          ? new TextEncoder().encode(content)
          : content;
      try {
        assertBinarySize(bytes.byteLength, "readFileBase64");
      } catch (e) {
        mapHostBinaryError(e);
      }
      return {
        path: norm!,
        base64: bytesToBase64(bytes),
        encoding: "base64" as const,
        byteLength: bytes.byteLength,
        hash: await hashBytes(bytes),
      };
    },

    async writeFileBase64(path: string, base64: string) {
      const session = requireSession(ctx, sandboxId);
      assertHostWritable(ctx, session.grant.hostSandboxId);
      let norm: string;
      try {
        norm = assertPathAllowed(session.grant, path, "write");
      } catch (e) {
        mapGrantError(e);
      }
      let bytes: Uint8Array;
      try {
        bytes = base64ToBytes(base64);
        assertBinarySize(bytes.byteLength, "writeFileBase64");
      } catch (e) {
        mapHostBinaryError(e);
      }
      const hostId = session.grant.hostSandboxId;
      if (hostId === ctx.getActiveId()) {
        await ctx.patchHostFile(norm!, bytes!);
      } else {
        await saveFile(hostId, norm!, bytes!);
      }
      return {
        path: norm!,
        byteLength: bytes!.byteLength,
        hash: await hashBytes(bytes!),
      };
    },

    async close() {
      // Worker grants: no-op close (revoke via registry). Tool tab closes session.
      const session = resolveSession(ctx, sandboxId);
      if (
        session &&
        ctx.getSession?.()?.toolSandboxId === session.toolSandboxId
      ) {
        await ctx.closeToolSession();
      }
      return { ok: true as const };
    },

    get DB() {
      const session = resolveSession(ctx, sandboxId);
      if (!session || !grantAllowsBinding(session.grant, "db"))
        return undefined;
      return createMockDb(session.grant.hostSandboxId);
    },

    get KV() {
      const session = resolveSession(ctx, sandboxId);
      if (!session || !grantAllowsBinding(session.grant, "kv"))
        return undefined;
      const raw = createMockKvNamespace(session.grant.hostSandboxId);
      return wrapKvForMode(raw, session.grant.mode);
    },
  };
}

export function createShellToolBridge(
  ctx: ShellToolBridgeContext
): ShellToolBridge {
  const foreground = buildBinding(ctx, undefined);
  return {
    ...foreground,
    get DB() {
      return foreground.DB;
    },
    get KV() {
      return foreground.KV;
    },
    forSandbox(sandboxId: string) {
      return buildBinding(ctx, sandboxId);
    },
  };
}
