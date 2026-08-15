/// <reference lib="webworker" />

/**
 * WASI preview1 runner Worker — `@bjorn3/browser_wasi_shim` + pinned .wasm CLIs.
 * DEC-039: prefer OPFS SyncAccessHandle preopen; memory entries remain for tests／fallback.
 */

declare const self: DedicatedWorkerGlobalScope;

import {
  ConsoleStdout,
  Directory,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
  WASIProcExit,
  type Inode,
} from "@bjorn3/browser_wasi_shim";
import { getWasiCmdInfo } from "./wasiPin";
import type { WasiFileEntry } from "./hostWasiFs";
import {
  openOpfsPreopenSession,
  resolvePlaygroundsProjectDir,
  supportsSyncAccessHandle,
} from "./wasiOpfsFs";

export type HostWasiWorkerIn = {
  type: "run";
  id: string;
  cmd: string;
  args: string[];
  /** WASI env strings (`KEY=VALUE`). */
  env: string[];
  stdin: string;
  wasmUrl: string;
  /** Memory mirror fallback — **ForTests only** when `projectId` omitted. */
  entries?: WasiFileEntry[];
  /** OPFS mode: sandbox id under playgrounds-projects/. */
  projectId?: string;
  /** Relative to project root; empty／omit = root. */
  cwd?: string;
};

export type HostWasiWorkerOut =
  | {
      type: "result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      exitCode: number;
      /** Memory-mode write-back (cwd-relative) — ForTests only. */
      entriesOut?: WasiFileEntry[];
      /** OPFS-mode dirty paths (project-relative). */
      changedPaths?: string[];
      deletedPaths?: string[];
    }
  | { type: "result"; id: string; ok: false; error: string; code?: string };

const wasmCache = new Map<string, Promise<WebAssembly.Module>>();

function loadModule(url: string): Promise<WebAssembly.Module> {
  let p = wasmCache.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`載入 wasm 失敗：${url} (${res.status})`);
      }
      try {
        return await WebAssembly.compileStreaming(res);
      } catch {
        const buf = await fetch(url).then(r => {
          if (!r.ok) throw new Error(`載入 wasm 失敗：${url} (${r.status})`);
          return r.arrayBuffer();
        });
        return WebAssembly.compile(buf);
      }
    })().catch(err => {
      wasmCache.delete(url);
      throw err;
    });
    wasmCache.set(url, p);
  }
  return p;
}

type DirNode = Map<string, DirNode | Uint8Array>;

function insertPath(root: DirNode, path: string, bytes: Uint8Array): void {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return;
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    let next = cur.get(part);
    if (!next || next instanceof Uint8Array) {
      next = new Map();
      cur.set(part, next);
    }
    cur = next;
  }
  cur.set(parts[parts.length - 1]!, bytes);
}

function dirNodeToInodeMap(node: DirNode): Map<string, Inode> {
  const map = new Map<string, Inode>();
  for (const [name, child] of node) {
    if (child instanceof Uint8Array) {
      map.set(name, new File(child));
    } else {
      map.set(name, new Directory(dirNodeToInodeMap(child)));
    }
  }
  return map;
}

function buildPreopenFromEntries(entries: WasiFileEntry[]): PreopenDirectory {
  const root: DirNode = new Map();
  for (const { path, bytes } of entries) {
    insertPath(root, path, bytes);
  }
  return new PreopenDirectory("/", dirNodeToInodeMap(root));
}

function walkDirectory(
  dir: Directory,
  prefix: string,
  out: WasiFileEntry[]
): void {
  for (const [name, inode] of dir.contents) {
    if (name === "." || name === "..") continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (inode instanceof File) {
      out.push({ path, bytes: inode.data.slice() });
    } else if (inode instanceof Directory) {
      walkDirectory(inode, path, out);
    }
  }
}

function collectEntries(preopen: PreopenDirectory): WasiFileEntry[] {
  const out: WasiFileEntry[] = [];
  walkDirectory(preopen.dir, "", out);
  return out;
}

async function runCmd(msg: HostWasiWorkerIn): Promise<HostWasiWorkerOut> {
  const info = getWasiCmdInfo(msg.cmd);
  if (!info) {
    return {
      type: "result",
      id: msg.id,
      ok: false,
      error: `不支援的命令：${msg.cmd}`,
      code: "not_supported",
    };
  }

  let session: Awaited<ReturnType<typeof openOpfsPreopenSession>> | null = null;
  let memPreopen: PreopenDirectory | null = null;

  try {
    const module = await loadModule(msg.wasmUrl || info.wasmUrl);
    const useOpfs = Boolean(msg.projectId) && supportsSyncAccessHandle();

    if (useOpfs && msg.projectId) {
      const projectDir = await resolvePlaygroundsProjectDir(msg.projectId);
      session = await openOpfsPreopenSession({
        projectDir,
        cwd: msg.cwd ?? "",
      });
    } else if (msg.projectId && !supportsSyncAccessHandle()) {
      return {
        type: "result",
        id: msg.id,
        ok: false,
        error:
          "此環境不支援 FileSystemSyncAccessHandle，無法以 OPFS 直連執行 WASI",
        code: "wasi_unavailable",
      };
    } else {
      memPreopen = buildPreopenFromEntries(msg.entries ?? []);
    }

    const preopen = session?.preopen ?? memPreopen!;
    let stdout = "";
    let stderr = "";
    const stdinBytes = new TextEncoder().encode(msg.stdin ?? "");
    // browser_wasi_shim enables debug when options.debug is omitted
    // (undefined → true); keep Console quiet in product runs.
    const wasiInst = new WASI(
      [msg.cmd, ...msg.args],
      msg.env ?? [],
      [
        new OpenFile(new File(stdinBytes)),
        ConsoleStdout.lineBuffered(line => {
          stdout += `${line}\n`;
        }),
        ConsoleStdout.lineBuffered(line => {
          stderr += `${line}\n`;
        }),
        preopen,
      ],
      { debug: false }
    );

    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: wasiInst.wasiImport,
    });

    let exitCode = 0;
    try {
      exitCode = wasiInst.start(
        instance as {
          exports: { memory: WebAssembly.Memory; _start: () => unknown };
        }
      );
    } catch (e) {
      if (e instanceof WASIProcExit) {
        exitCode = e.code;
      } else {
        throw e;
      }
    }

    if (session) {
      const { changedPaths, deletedPaths } = await session.finish();
      return {
        type: "result",
        id: msg.id,
        ok: true,
        stdout,
        stderr,
        exitCode,
        changedPaths,
        deletedPaths,
      };
    }

    return {
      type: "result",
      id: msg.id,
      ok: true,
      stdout,
      stderr,
      exitCode,
      entriesOut: collectEntries(preopen),
    };
  } catch (e) {
    if (session) {
      try {
        await session.finish();
      } catch {
        /* best-effort close handles */
      }
    }
    return {
      type: "result",
      id: msg.id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "wasi_unavailable",
    };
  }
}

self.addEventListener("unhandledrejection", ev => {
  const reason = ev.reason;
  const error =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : "WASI Worker unhandledrejection";
  self.postMessage({
    type: "result",
    id: "unhandled",
    ok: false,
    error,
    code: "wasi_unavailable",
  } satisfies HostWasiWorkerOut);
});

self.onmessage = (ev: MessageEvent<HostWasiWorkerIn>) => {
  const msg = ev.data;
  if (!msg || msg.type !== "run") return;
  void runCmd(msg)
    .then(out => {
      self.postMessage(out);
    })
    .catch((e: unknown) => {
      const out: HostWasiWorkerOut = {
        type: "result",
        id: msg.id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "wasi_unavailable",
      };
      self.postMessage(out);
    });
};

// Keep this file a module (avoids DOM/`self` redeclaration under check).
export {};
