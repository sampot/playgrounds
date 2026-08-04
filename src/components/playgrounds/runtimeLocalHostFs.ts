/**
 * Runtime-local HOST FS helpers (DEC-038).
 * Persist via OPFS inside Backend Runtime; mutate an in-memory FileMap snapshot.
 */

import { assertNotWritingActiveAgent } from "./hostBridge";
import { hashBytes, hashUtf8 } from "./contentHash";
import { bytesToBase64, base64ToBytes } from "./hostBinary";
import { listDirFromFileMap, type ListDirOptions } from "./hostListDir";
import { normalizeProjectPath } from "./pathUtils";
import {
  createDir,
  deleteDir,
  deleteFile,
  loadProjectFiles,
  saveFile,
} from "./opfsStore";
import {
  isBinaryContent,
  isTextContent,
  type FileContent,
  type FileMap,
} from "./projectTypes";

export type FsChangedEvent = {
  sandboxId: string;
  op: "write" | "mkdir" | "remove";
  path: string;
  /** Present on write; text or omitted for binary notify. */
  content?: string;
};

function parseWriteOptions(
  sandboxIdOrOptions?: string | { sandboxId?: string; expectedHash?: string }
): { sandboxId?: string; expectedHash?: string } {
  if (typeof sandboxIdOrOptions === "string") {
    return { sandboxId: sandboxIdOrOptions };
  }
  return sandboxIdOrOptions ?? {};
}

export function createRuntimeLocalFsHandlers(opts: {
  files: FileMap;
  sandboxId: string;
  activeAgentSandboxId: string | null;
  onFsChanged?: (ev: FsChangedEvent) => void;
  /** Await exclusive OPFS holders (e.g. WASI SyncAccessHandle) before access. */
  beforeFsAccess?: () => Promise<void>;
}): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const {
    files,
    sandboxId: defaultId,
    activeAgentSandboxId,
    onFsChanged,
    beforeFsAccess,
  } = opts;

  const gate = async () => {
    if (beforeFsAccess) await beforeFsAccess();
  };

  const resolveId = (sandboxId?: string) => sandboxId || defaultId;

  const touchSnapshot = (id: string, path: string, content: FileContent) => {
    if (id === defaultId) files[path] = content;
  };

  const dropSnapshot = (id: string, path: string) => {
    if (id !== defaultId) return;
    delete files[path];
    const prefix = path.endsWith("/") ? path : `${path}/`;
    for (const key of Object.keys(files)) {
      if (key.startsWith(prefix)) delete files[key];
    }
  };

  return {
    async writeFile(
      path: unknown,
      content: unknown,
      sandboxIdOrOptions?: unknown
    ) {
      await gate();
      const writeOpts = parseWriteOptions(
        sandboxIdOrOptions as
          string | { sandboxId?: string; expectedHash?: string } | undefined
      );
      const id = resolveId(writeOpts.sandboxId);
      assertNotWritingActiveAgent(id, activeAgentSandboxId, "writeFile");
      const norm = normalizeProjectPath(String(path ?? ""));
      if (!norm) {
        throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
      }
      const text = String(content ?? "");
      if (writeOpts.expectedHash) {
        const existing =
          id === defaultId ? files[norm] : (await loadProjectFiles(id))[norm];
        if (existing !== undefined && !isBinaryContent(existing)) {
          const currentHash = await hashUtf8(
            typeof existing === "string"
              ? existing
              : new TextDecoder().decode(existing)
          );
          if (currentHash !== writeOpts.expectedHash) {
            throw Object.assign(
              new Error(`檔案內容已變更（expectedHash 不符）：${norm}`),
              { code: "conflict" }
            );
          }
        } else if (existing === undefined) {
          throw Object.assign(
            new Error(`檔案不存在，無法套用 expectedHash：${norm}`),
            { code: "conflict" }
          );
        } else if (existing !== undefined && isBinaryContent(existing)) {
          throw Object.assign(
            new Error(`檔案為二進位，無法以 expectedHash 覆寫：${norm}`),
            { code: "binary" }
          );
        }
      }
      await saveFile(id, norm, text);
      touchSnapshot(id, norm, text);
      onFsChanged?.({
        sandboxId: id,
        op: "write",
        path: norm,
        content: text,
      });
      return { path: norm, hash: await hashUtf8(text) };
    },

    async writeFileBase64(path: unknown, base64: unknown, sandboxId?: unknown) {
      await gate();
      const id = resolveId(
        typeof sandboxId === "string" ? sandboxId : undefined
      );
      assertNotWritingActiveAgent(id, activeAgentSandboxId, "writeFileBase64");
      const norm = normalizeProjectPath(String(path ?? ""));
      if (!norm) {
        throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
      }
      const bytes = base64ToBytes(String(base64 ?? ""));
      await saveFile(id, norm, bytes);
      touchSnapshot(id, norm, bytes);
      onFsChanged?.({ sandboxId: id, op: "write", path: norm });
      return {
        path: norm,
        byteLength: bytes.byteLength,
        hash: await hashBytes(bytes),
      };
    },

    async mkdir(path: unknown, sandboxId?: unknown) {
      await gate();
      const id = resolveId(
        typeof sandboxId === "string" ? sandboxId : undefined
      );
      assertNotWritingActiveAgent(id, activeAgentSandboxId, "mkdir");
      const norm = normalizeProjectPath(String(path ?? ""));
      if (!norm) {
        throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
      }
      await createDir(id, norm);
      onFsChanged?.({ sandboxId: id, op: "mkdir", path: norm });
      return { path: norm };
    },

    async remove(path: unknown, sandboxId?: unknown) {
      await gate();
      const id = resolveId(
        typeof sandboxId === "string" ? sandboxId : undefined
      );
      assertNotWritingActiveAgent(id, activeAgentSandboxId, "remove");
      const norm = normalizeProjectPath(String(path ?? ""));
      if (!norm) {
        throw Object.assign(new Error("路徑無效"), { code: "bad_path" });
      }
      try {
        await deleteFile(id, norm);
      } catch {
        await deleteDir(id, norm);
      }
      dropSnapshot(id, norm);
      onFsChanged?.({ sandboxId: id, op: "remove", path: norm });
      return { path: norm };
    },

    async listDir(options?: unknown) {
      await gate();
      const opts = (options ?? {}) as ListDirOptions & { sandboxId?: string };
      const id = resolveId(opts.sandboxId);
      const map = id === defaultId ? files : await loadProjectFiles(id);
      return listDirFromFileMap(map, opts);
    },
  };
}
