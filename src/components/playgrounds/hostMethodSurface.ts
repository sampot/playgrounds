/**
 * HOST／Delegate method surface classification (DEC-038 §6).
 * `local` = Runtime-side (storage／pure data); `shell` = terminal UI instruction.
 */

export type HostMethodSurface = "local" | "shell";

/** Methods that must run in Backend Runtime (storage／pure data). */
export const HOST_LOCAL_METHODS = [
  "apiVersion",
  "capabilities",
  "listProjects",
  "getProject",
  "createProject",
  "cloneProject",
  "setWorkingSet",
  "deleteProject",
  "getActiveAgent",
  "setActiveAgent",
  "getTargetProject",
  "setTargetProject",
  "listFiles",
  "listDir",
  "readFile",
  "writeFile",
  "mkdir",
  "remove",
  "readFileBase64",
  "writeFileBase64",
  "search",
  "checkpoint",
  "restore",
  "listCheckpoints",
  "getSecretStoreStatus",
  "listSecrets",
  "listSecretNames",
  "createPlatformInvite",
  "revokePlatformInvite",
  "listFleetSummary",
  "getAgentUi",
  "setAgentUi",
  "listCmds",
  // Compute affinity target＝Runtime; MVP may still shell-run with snapshot.
  "runPython",
  "runCmd",
] as const;

/** Terminal shell-face methods (must complete without Runtime authority round-trip). */
export const HOST_SHELL_METHODS = [
  "openProject",
  "openFile",
  "reloadCanvas",
  "getConsole",
  "clearConsole",
  "waitConsole",
  "getCanvasStatus",
  "getNetworkLog",
  "clearNetworkLog",
  "getDomSnapshot",
  "captureCanvas",
  "openTool",
  "closeTool",
  "getToolSession",
  "openMainCanvas",
  "closeMainTab",
  "setMainTab",
  "listMainTabs",
  "getMainTab",
  "openSession",
  "closeSession",
  "pauseSession",
  "resumeSession",
  "getSession",
  "listSeats",
  "joinSeat",
  "leaveSeat",
  "spawnParticipant",
  "hostSessionFetch",
] as const;

const LOCAL_SET = new Set<string>(HOST_LOCAL_METHODS);
const SHELL_SET = new Set<string>(HOST_SHELL_METHODS);

export function hostMethodSurface(method: string): HostMethodSurface | null {
  if (LOCAL_SET.has(method)) return "local";
  if (SHELL_SET.has(method)) return "shell";
  return null;
}

export function isHostShellMethod(method: string): boolean {
  return hostMethodSurface(method) === "shell";
}

export function isHostLocalMethod(method: string): boolean {
  return hostMethodSurface(method) === "local";
}
