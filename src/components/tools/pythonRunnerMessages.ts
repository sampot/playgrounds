/** Message protocol between PythonRunnerTool and its Web Worker. */

export type RunnerStatusPhase = "loading" | "installing" | "running" | "ready";

export type WorkerInMessage =
  { type: "init" } | { type: "run"; code: string; packages: string[] };

export type WorkerOutMessage =
  | { type: "status"; phase: RunnerStatusPhase; detail?: string }
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "done"; ok: true }
  | { type: "done"; ok: false; error: string };
