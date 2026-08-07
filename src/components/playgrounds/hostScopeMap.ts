/**
 * Scope → HOST method projection (DEC-051 / PG-API-SCOPES-SPEC §5.3).
 */

import { HOST_CAPABILITIES, type HostCapability } from "./hostCapabilities";
import {
  expandEffectiveCapabilities,
  filterKnownCapabilities,
  hasCapability,
  KNOWN_CAPABILITIES,
  type KnownCapability,
} from "./samCapabilities";

/** Intrinsic probe methods always present on any HOST-shaped handle. */
export const HOST_INTRINSIC_METHODS = [
  "apiVersion",
  "capabilities",
  "listKnownScopes",
  "listAdmittedScopes",
] as const;

/**
 * Methods hung on each scope. Families are not an exhaustive API promise —
 * new same-harm methods may join a scope without re-admit (§5.5).
 */
export const SCOPE_METHODS: Readonly<
  Record<KnownCapability, readonly string[]>
> = {
  "compute:python": ["runPython"],
  "compute:cmd": ["runCmd", "listCmds"],
  "sandbox:list": ["listProjects", "getProject", "listFiles", "listDir"],
  "sandbox:read": ["readFile", "readFileBase64", "search"],
  "sandbox:write": [
    "writeFile",
    "writeFileBase64",
    "mkdir",
    "remove",
    "openFile",
  ],
  "sandbox:edit": [
    "listProjects",
    "getProject",
    "listFiles",
    "listDir",
    "readFile",
    "readFileBase64",
    "search",
    "writeFile",
    "writeFileBase64",
    "mkdir",
    "remove",
    "openFile",
  ],
  "sandbox:create": [
    "createProject",
    "cloneProject",
    "openProject",
    "setWorkingSet",
  ],
  "sandbox:delete-managed": ["deleteProject"],
  "canvas:observe": [
    "reloadCanvas",
    "getConsole",
    "clearConsole",
    "waitConsole",
    "getCanvasStatus",
    "getNetworkLog",
    "clearNetworkLog",
    "getDomSnapshot",
    "captureCanvas",
  ],
  "secrets:list": ["getSecretStoreStatus", "listSecrets", "listSecretNames"],
  "secrets:get": [],
  "platform:invite": ["createPlatformInvite", "revokePlatformInvite"],
  "session:host": [
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
  ],
  "agent:fleet": ["listFleetSummary", "getAgentUi", "setAgentUi"],
  "ui:tabs": [
    "openMainCanvas",
    "openTool",
    "closeTool",
    "getToolSession",
    "closeMainTab",
    "setMainTab",
    "listMainTabs",
    "getMainTab",
  ],
  checkpoint: ["checkpoint", "listCheckpoints", "restore"],
};

export function listKnownScopes(): KnownCapability[] {
  return [...KNOWN_CAPABILITIES];
}

/** True when scopes project at least one HOST method (not secrets:get-only). */
export function admitsHostBinding(
  scopes: readonly string[] | null | undefined
): boolean {
  const expanded = expandEffectiveCapabilities(scopes);
  for (const s of expanded) {
    if ((SCOPE_METHODS[s] ?? []).length > 0) return true;
  }
  return false;
}

export function methodsForScopes(
  scopes: readonly string[] | null | undefined
): string[] {
  const expanded = expandEffectiveCapabilities(scopes);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of HOST_INTRINSIC_METHODS) {
    seen.add(m);
    out.push(m);
  }
  for (const s of expanded) {
    for (const m of SCOPE_METHODS[s] ?? []) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  // Preserve HOST_CAPABILITIES order for stable capabilities() lists.
  const order = new Map<string, number>(
    (HOST_CAPABILITIES as readonly string[]).map((m, i) => [m, i])
  );
  for (const m of HOST_INTRINSIC_METHODS) {
    if (!order.has(m)) order.set(m, 10_000 + order.size);
  }
  return out.sort(
    (a, b) => (order.get(a) ?? 9999) - (order.get(b) ?? 9999) || a.localeCompare(b)
  );
}

export function methodAllowedByScopes(
  method: string,
  scopes: readonly string[] | null | undefined
): boolean {
  if ((HOST_INTRINSIC_METHODS as readonly string[]).includes(method)) {
    return true;
  }
  const allowed = new Set(methodsForScopes(scopes));
  return allowed.has(method);
}

/** Scope tokens that authorize a method (for errors / docs). */
export function scopesForMethod(method: string): KnownCapability[] {
  if ((HOST_INTRINSIC_METHODS as readonly string[]).includes(method)) {
    return [];
  }
  const out: KnownCapability[] = [];
  for (const scope of KNOWN_CAPABILITIES) {
    if ((SCOPE_METHODS[scope] as readonly string[]).includes(method)) {
      out.push(scope);
    }
  }
  return out;
}

export function hasSandboxFsScope(
  scopes: readonly string[] | null | undefined,
  kind: "list" | "read" | "write"
): boolean {
  const token =
    kind === "list"
      ? "sandbox:list"
      : kind === "read"
        ? "sandbox:read"
        : "sandbox:write";
  return hasCapability(scopes, token);
}

export function grantModeForScopes(
  scopes: readonly string[] | null | undefined
): "read" | "readwrite" | null {
  if (hasCapability(scopes, "sandbox:write")) return "readwrite";
  if (
    hasCapability(scopes, "sandbox:read") ||
    hasCapability(scopes, "sandbox:list")
  ) {
    return "read";
  }
  return null;
}

export function filterAdmittedScopes(
  scopes: readonly string[] | null | undefined
): KnownCapability[] {
  return filterKnownCapabilities(scopes);
}

export type { HostCapability };
