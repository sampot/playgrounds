/// <reference lib="webworker" />

/**
 * Isolated Pyodide worker for HOST.runPython + human REPL.
 * Does not touch the DOM; stdout/stderr are buffered per request.
 */

import {
  PYODIDE_INDEX_URL,
  PYODIDE_MODULE_URL,
  PYODIDE_VERSION,
} from "../tools/pythonRunnerShare";
import { REPL_PROJECT_FS_ROOT } from "./hostPythonRepl";
import {
  listReplProjectFiles,
  readReplProjectBytes,
  replProjectBytesToText,
  writeReplProjectBytes,
} from "./replOpfsProject";

declare const self: DedicatedWorkerGlobalScope;

type PyodideInterface = {
  loadPackage: (names: string | string[]) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<unknown>;
  runPythonAsync: (code: string) => Promise<unknown>;
  runPython: (code: string) => unknown;
  setStdout: (opts: { batched: (text: string) => void }) => void;
  setStderr: (opts: { batched: (text: string) => void }) => void;
  globals: {
    get: (name: string) => unknown;
    set: (name: string, v: unknown) => void;
  };
};

type WorkerIn =
  | { type: "run"; id: string; code: string; packages: string[] }
  | { type: "repl"; id: string; line: string }
  | { type: "install"; id: string; packages: string[] }
  | {
      type: "run_script";
      id: string;
      path: string;
      code: string;
      projectFiles: Record<string, string>;
      /** When set, sync scripts／data from OPFS in-worker (no FileMap mirror). */
      projectId?: string;
    }
  | { type: "reset"; id: string }
  | { type: "cancel_repl"; id: string }
  | { type: "ensure"; id: string };

type WorkerOut =
  | {
      type: "result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      result?: string;
    }
  | {
      type: "result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "repl_result";
      id: string;
      incomplete: boolean;
      prompt: ">>> " | "... ";
      stdout: string;
      stderr: string;
      result?: string;
      error?: string;
    }
  | {
      type: "install_result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
    }
  | {
      type: "install_result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | {
      type: "run_script_result";
      id: string;
      ok: true;
      stdout: string;
      stderr: string;
      changedPaths?: string[];
    }
  | {
      type: "run_script_result";
      id: string;
      ok: false;
      error: string;
      stdout?: string;
      stderr?: string;
    }
  | { type: "reset_done"; id: string }
  | { type: "cancel_done"; id: string }
  | { type: "ready"; id: string; pyodideVersion: string }
  | { type: "error"; id: string; error: string };

let pyodide: PyodideInterface | null = null;
let loadPromise: Promise<PyodideInterface> | null = null;
/** Accumulated source for the current incomplete REPL statement. */
let replBuffer = "";
/** Serialize Pyodide work (not safely re-entrant). */
let queue: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>): void {
  queue = queue.then(task, task);
}

function stringifyResult(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function ensurePyodide(
  onStdout: (t: string) => void,
  onStderr: (t: string) => void
): Promise<PyodideInterface> {
  if (pyodide) {
    pyodide.setStdout({ batched: onStdout });
    pyodide.setStderr({ batched: onStderr });
    return pyodide;
  }
  if (loadPromise) {
    const instance = await loadPromise;
    instance.setStdout({ batched: onStdout });
    instance.setStderr({ batched: onStderr });
    return instance;
  }

  loadPromise = (async () => {
    const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE_URL);
    const instance = (await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
    })) as PyodideInterface;
    await instance.loadPackage("micropip");
    pyodide = instance;
    return instance;
  })();

  try {
    const instance = await loadPromise;
    instance.setStdout({ batched: onStdout });
    instance.setStderr({ batched: onStderr });
    return instance;
  } catch (err) {
    loadPromise = null;
    pyodide = null;
    throw err;
  }
}

async function installPackages(
  runtime: PyodideInterface,
  packages: string[]
): Promise<void> {
  if (packages.length === 0) return;
  await runtime.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(packages)})
`);
}

async function runOne(msg: Extract<WorkerIn, { type: "run" }>): Promise<void> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  try {
    const runtime = await ensurePyodide(
      t => stdoutParts.push(t),
      t => stderrParts.push(t)
    );
    await installPackages(runtime, msg.packages || []);
    try {
      await runtime.loadPackagesFromImports(msg.code);
    } catch {
      /* best-effort */
    }
    const value = await runtime.runPythonAsync(msg.code);
    const out: WorkerOut = {
      type: "result",
      id: msg.id,
      ok: true,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      result: stringifyResult(value),
    };
    self.postMessage(out);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    const out: WorkerOut = {
      type: "result",
      id: msg.id,
      ok: false,
      error: message,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    };
    self.postMessage(out);
  }
}

async function resetInterpreter(id: string): Promise<void> {
  replBuffer = "";
  try {
    if (!pyodide && !loadPromise) {
      self.postMessage({ type: "reset_done", id } satisfies WorkerOut);
      return;
    }
    const runtime = await ensurePyodide(
      () => {},
      () => {}
    );
    await runtime.runPythonAsync(`
import sys
_g = sys.modules["__main__"].__dict__
_keep = {"__name__", "__doc__", "__package__", "__loader__", "__spec__", "__builtins__", "__annotations__"}
for _k in list(_g.keys()):
    if _k not in _keep:
        del _g[_k]
`);
    self.postMessage({ type: "reset_done", id } satisfies WorkerOut);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({ type: "error", id, error: message } satisfies WorkerOut);
  }
}

async function ensureReady(id: string): Promise<void> {
  try {
    await ensurePyodide(
      () => {},
      () => {}
    );
    self.postMessage({
      type: "ready",
      id,
      pyodideVersion: PYODIDE_VERSION,
    } satisfies WorkerOut);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({ type: "error", id, error: message } satisfies WorkerOut);
  }
}

async function replOne(
  msg: Extract<WorkerIn, { type: "repl" }>
): Promise<void> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  try {
    if (!replBuffer && !msg.line.trim()) {
      self.postMessage({
        type: "repl_result",
        id: msg.id,
        incomplete: false,
        prompt: ">>> ",
        stdout: "",
        stderr: "",
      } satisfies WorkerOut);
      return;
    }

    replBuffer += `${msg.line}\n`;
    const runtime = await ensurePyodide(
      t => stdoutParts.push(t),
      t => stderrParts.push(t)
    );

    runtime.globals.set("_playgrounds_repl_src", replBuffer);
    await runtime.runPythonAsync(`
import codeop
import sys
_src = _playgrounds_repl_src
_playgrounds_repl_status = "incomplete"
_playgrounds_repl_err = None
_playgrounds_repl_code = None
try:
    _cmd = codeop.compile_command(_src, "<stdin>", "single")
    if _cmd is None:
        _playgrounds_repl_status = "incomplete"
    else:
        _playgrounds_repl_status = "complete"
        _playgrounds_repl_code = _cmd
except SyntaxError as e:
    _playgrounds_repl_status = "syntax"
    _playgrounds_repl_err = f"{type(e).__name__}: {e}"
`);

    const status = String(
      runtime.globals.get("_playgrounds_repl_status") ?? ""
    );
    if (status === "incomplete") {
      self.postMessage({
        type: "repl_result",
        id: msg.id,
        incomplete: true,
        prompt: "... ",
        stdout: "",
        stderr: "",
      } satisfies WorkerOut);
      return;
    }

    if (status === "syntax") {
      const err = String(
        runtime.globals.get("_playgrounds_repl_err") ?? "SyntaxError"
      );
      replBuffer = "";
      self.postMessage({
        type: "repl_result",
        id: msg.id,
        incomplete: false,
        prompt: ">>> ",
        stdout: stdoutParts.join(""),
        stderr: stderrParts.join(""),
        error: err,
      } satisfies WorkerOut);
      return;
    }

    // complete — load imports from CDN then exec
    try {
      await runtime.loadPackagesFromImports(replBuffer);
    } catch {
      /* best-effort; import may still fail with a clear error */
    }
    await runtime.runPythonAsync(`
exec(_playgrounds_repl_code, globals())
`);
    try {
      runtime.runPython(
        "del _playgrounds_repl_src, _playgrounds_repl_status, _playgrounds_repl_err, _playgrounds_repl_code"
      );
    } catch {
      /* optional */
    }

    replBuffer = "";
    self.postMessage({
      type: "repl_result",
      id: msg.id,
      incomplete: false,
      prompt: ">>> ",
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    } satisfies WorkerOut);
  } catch (err) {
    replBuffer = "";
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({
      type: "repl_result",
      id: msg.id,
      incomplete: false,
      prompt: ">>> ",
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      error: message,
    } satisfies WorkerOut);
  }
}

async function installOne(
  msg: Extract<WorkerIn, { type: "install" }>
): Promise<void> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  try {
    const runtime = await ensurePyodide(
      t => stdoutParts.push(t),
      t => stderrParts.push(t)
    );
    const packages = msg.packages || [];
    if (packages.length) {
      try {
        await runtime.loadPackage(packages);
      } catch {
        await installPackages(runtime, packages);
      }
    }
    self.postMessage({
      type: "install_result",
      id: msg.id,
      ok: true,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    } satisfies WorkerOut);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({
      type: "install_result",
      id: msg.id,
      ok: false,
      error: message,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    } satisfies WorkerOut);
  }
}

async function syncProjectFiles(
  runtime: PyodideInterface,
  projectFiles: Record<string, string>
): Promise<void> {
  runtime.globals.set("_pg_files_json", JSON.stringify(projectFiles || {}));
  runtime.globals.set("_pg_root", REPL_PROJECT_FS_ROOT);
  await runtime.runPythonAsync(`
import json, os, shutil, sys
ROOT = str(_pg_root)
if os.path.isdir(ROOT):
    shutil.rmtree(ROOT)
os.makedirs(ROOT, exist_ok=True)
files = json.loads(_pg_files_json)
for rel, text in files.items():
    rel = str(rel).replace("\\\\", "/").lstrip("/")
    if ".." in rel.split("/"):
        continue
    full = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(str(text))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
`);
}

type PyodideFs = {
  mkdirTree(path: string): void;
  writeFile(path: string, data: string | Uint8Array): void;
  readFile(path: string, opts?: { encoding: "binary" }): Uint8Array;
  readdir(path: string): string[];
  stat(path: string): { isFile(): boolean; isDirectory(): boolean };
};

function pyodideFs(runtime: PyodideInterface): PyodideFs {
  return (runtime as PyodideInterface & { FS: PyodideFs }).FS;
}

function joinPyPath(root: string, rel: string): string {
  const parts = rel.split("/").filter(Boolean);
  return [root, ...parts].join("/");
}

async function syncOpfsProjectToPyodide(
  runtime: PyodideInterface,
  projectId: string
): Promise<Map<string, Uint8Array>> {
  const snapshot = new Map<string, Uint8Array>();
  const fs = pyodideFs(runtime);
  const root = REPL_PROJECT_FS_ROOT;
  try {
    fs.mkdirTree(root);
  } catch {
    /* may exist */
  }
  const entries = await listReplProjectFiles(projectId);
  for (const { path, bytes } of entries) {
    snapshot.set(path, bytes);
    const full = joinPyPath(root, path);
    const dir = full.slice(0, full.lastIndexOf("/"));
    if (dir && dir !== root) {
      try {
        fs.mkdirTree(dir);
      } catch {
        /* ignore */
      }
    }
    fs.writeFile(full, bytes);
  }
  runtime.globals.set("_pg_root", root);
  await runtime.runPythonAsync(`
import sys
ROOT = str(_pg_root)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
`);
  return snapshot;
}

function collectPyodideProjectFiles(
  runtime: PyodideInterface
): Map<string, Uint8Array> {
  const fs = pyodideFs(runtime);
  const root = REPL_PROJECT_FS_ROOT;
  const out = new Map<string, Uint8Array>();

  function walk(dir: string, prefix: string): void {
    let names: string[];
    try {
      names = fs.readdir(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (name === "." || name === "..") continue;
      const full = `${dir}/${name}`;
      let st: ReturnType<PyodideFs["stat"]>;
      try {
        st = fs.stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, prefix ? `${prefix}/${name}` : name);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      try {
        out.set(rel, fs.readFile(full, { encoding: "binary" }));
      } catch {
        /* skip unreadable */
      }
    }
  }

  walk(root, "");
  return out;
}

async function persistPyodideWrites(
  projectId: string,
  before: Map<string, Uint8Array>,
  after: Map<string, Uint8Array>
): Promise<string[]> {
  const changed: string[] = [];
  for (const [path, bytes] of after) {
    const prev = before.get(path);
    if (
      prev &&
      prev.byteLength === bytes.byteLength &&
      prev.every((b, i) => b === bytes[i]!)
    ) {
      continue;
    }
    await writeReplProjectBytes(projectId, path, bytes);
    changed.push(path);
  }
  return changed;
}

async function runScriptOne(
  msg: Extract<WorkerIn, { type: "run_script" }>
): Promise<void> {
  const stdoutParts: string[] = [];
  const stderrParts: string[] = [];
  try {
    const runtime = await ensurePyodide(
      t => stdoutParts.push(t),
      t => stderrParts.push(t)
    );
    let scriptPath = msg.path;
    let scriptCode = msg.code;
    let snapshot = new Map<string, Uint8Array>();

    if (msg.projectId) {
      snapshot = await syncOpfsProjectToPyodide(runtime, msg.projectId);
      const bytes = await readReplProjectBytes(msg.projectId, scriptPath);
      if (!bytes) {
        throw new Error(`找不到檔案：${scriptPath}`);
      }
      scriptCode = replProjectBytesToText(bytes);
    } else {
      const files = { ...(msg.projectFiles || {}) };
      if (!(msg.path in files)) {
        files[msg.path] = msg.code;
      }
      await syncProjectFiles(runtime, files);
    }

    try {
      await runtime.loadPackagesFromImports(scriptCode);
    } catch {
      /* best-effort */
    }
    runtime.globals.set("_pg_run_path", scriptPath);
    runtime.globals.set("_pg_run_code", scriptCode);
    runtime.globals.set("_pg_root", REPL_PROJECT_FS_ROOT);
    await runtime.runPythonAsync(`
import os
ROOT = str(_pg_root)
rel = str(_pg_run_path).replace("\\\\", "/").lstrip("/")
full = os.path.join(ROOT, rel)
os.chdir(os.path.dirname(full) or ROOT)
code = compile(str(_pg_run_code), full, "exec")
ns = globals()
ns["__name__"] = "__main__"
ns["__file__"] = full
exec(code, ns)
`);

    let changedPaths: string[] | undefined;
    if (msg.projectId) {
      const after = collectPyodideProjectFiles(runtime);
      changedPaths = await persistPyodideWrites(msg.projectId, snapshot, after);
    }

    self.postMessage({
      type: "run_script_result",
      id: msg.id,
      ok: true,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
      changedPaths,
    } satisfies WorkerOut);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    self.postMessage({
      type: "run_script_result",
      id: msg.id,
      ok: false,
      error: message,
      stdout: stdoutParts.join(""),
      stderr: stderrParts.join(""),
    } satisfies WorkerOut);
  }
}

self.onmessage = (event: MessageEvent<WorkerIn>) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !data.id) return;
  if (data.type === "run") {
    enqueue(() => runOne(data));
    return;
  }
  if (data.type === "repl") {
    enqueue(() => replOne(data));
    return;
  }
  if (data.type === "install") {
    enqueue(() => installOne(data));
    return;
  }
  if (data.type === "run_script") {
    enqueue(() => runScriptOne(data));
    return;
  }
  if (data.type === "reset") {
    enqueue(() => resetInterpreter(data.id));
    return;
  }
  if (data.type === "cancel_repl") {
    enqueue(async () => {
      replBuffer = "";
      self.postMessage({
        type: "cancel_done",
        id: data.id,
      } satisfies WorkerOut);
    });
    return;
  }
  if (data.type === "ensure") {
    enqueue(() => ensureReady(data.id));
  }
};
