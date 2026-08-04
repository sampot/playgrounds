/// <reference lib="webworker" />

import { PYODIDE_INDEX_URL, PYODIDE_MODULE_URL } from "./pythonRunnerShare";
import type { WorkerInMessage, WorkerOutMessage } from "./pythonRunnerMessages";

declare const self: DedicatedWorkerGlobalScope;

type PyodideInterface = {
  loadPackage: (names: string | string[]) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<unknown>;
  runPythonAsync: (code: string) => Promise<unknown>;
  setStdout: (opts: { batched: (text: string) => void }) => void;
  setStderr: (opts: { batched: (text: string) => void }) => void;
};

let pyodide: PyodideInterface | null = null;
let loadPromise: Promise<PyodideInterface> | null = null;

function post(msg: WorkerOutMessage) {
  self.postMessage(msg);
}

async function ensurePyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    post({
      type: "status",
      phase: "loading",
      detail: "正在從 CDN 載入 Pyodide（首次可能需數十秒）…",
    });

    const { loadPyodide } = await import(/* @vite-ignore */ PYODIDE_MODULE_URL);

    const instance = (await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
    })) as PyodideInterface;

    instance.setStdout({
      batched: (text: string) => post({ type: "stdout", text }),
    });
    instance.setStderr({
      batched: (text: string) => post({ type: "stderr", text }),
    });

    post({
      type: "status",
      phase: "loading",
      detail: "正在載入 micropip…",
    });
    await instance.loadPackage("micropip");

    pyodide = instance;
    post({ type: "status", phase: "ready", detail: "執行環境就緒" });
    return instance;
  })();

  try {
    return await loadPromise;
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

  post({
    type: "status",
    phase: "installing",
    detail: `安裝套件：${packages.join(", ")}`,
  });

  await runtime.runPythonAsync(`
import micropip
await micropip.install(${JSON.stringify(packages)})
`);
}

async function runCode(code: string, packages: string[]): Promise<void> {
  const runtime = await ensurePyodide();

  try {
    await installPackages(runtime, packages);

    post({
      type: "status",
      phase: "running",
      detail: "執行中…",
    });

    // Load any Pyodide-bundled packages inferred from imports (best-effort).
    try {
      await runtime.loadPackagesFromImports(code);
    } catch {
      // micropip / explicit packages cover the rest; ignore inference failures.
    }

    await runtime.runPythonAsync(code);
    post({ type: "done", ok: true });
    post({ type: "status", phase: "ready", detail: "執行環境就緒" });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : String(err);
    post({ type: "done", ok: false, error: message });
    post({ type: "status", phase: "ready", detail: "執行環境就緒" });
  }
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "init") {
    void ensurePyodide().catch(err => {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: "done", ok: false, error: `載入 Pyodide 失敗：${message}` });
    });
    return;
  }

  if (msg.type === "run") {
    void runCode(msg.code, msg.packages);
  }
};
