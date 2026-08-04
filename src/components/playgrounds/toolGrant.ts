/**
 * Delegate / Tool grant normalization and path checks (DEC-022／037).
 * OPFS paths plus virtual `.bindings/db`｜`.bindings/kv` → host env.DB／env.KV.
 */

import { isUnderDir, normalizeProjectPath } from "./pathUtils";
import { readHostSandboxId, readToolSandboxId } from "./sandboxIdCompat";

export type ToolGrantMode = "read" | "readwrite";

export type ToolPathOp = "read" | "write";

/** Virtual binding leaf under `.bindings/` (DEC-037). */
export type BindingsVirtualKind = "db" | "kv";

export type GrantPathKind = "opfs" | BindingsVirtualKind;

export interface ToolGrant {
  hostSandboxId: string;
  /** Normalized exact paths and/or directory prefixes; may include virtual bindings. */
  paths: string[];
  mode: ToolGrantMode;
}

export interface ToolSession {
  toolSandboxId: string;
  grant: ToolGrant;
  focusPath?: string;
}

export type ToolGrantErrorCode =
  | "bad_grant"
  | "bad_path"
  | "forbidden"
  | "tool_inactive"
  | "grant_inactive"
  | "bindings_virtual_not_file"
  | "grant_binding_required";

export class ToolGrantError extends Error {
  readonly code: ToolGrantErrorCode;

  constructor(code: ToolGrantErrorCode, message: string) {
    super(message);
    this.name = "ToolGrantError";
    this.code = code;
  }
}

/** Common virtual subdirectory for Durable binding entry points (DEC-037). */
export const BINDINGS_DIR = ".bindings";
export const BINDINGS_DB_PATH = `${BINDINGS_DIR}/db`;
/** Historical path; canonicalizeGrantPath maps this to BINDINGS_DB_PATH. */
export const LEGACY_BINDINGS_D1_PATH = `${BINDINGS_DIR}/d1`;
export const BINDINGS_KV_PATH = `${BINDINGS_DIR}/kv`;

/** Files-tree leaf entries (entry only; do not expand keys/tables). */
export const BINDINGS_VIRTUAL_LEAF_PATHS = [
  BINDINGS_DB_PATH,
  BINDINGS_KV_PATH,
] as const;

function normalizeMode(mode: unknown): ToolGrantMode {
  if (mode === "read" || mode === "readwrite") return mode;
  throw new ToolGrantError("bad_grant", "grant.mode 必須是 read 或 readwrite");
}

/**
 * Canonicalize grant/open path (legacy `.bindings/d1` → `.bindings/db`).
 */
export function canonicalizeGrantPath(path: string): string {
  let norm: string;
  try {
    norm = normalizeProjectPath(path);
  } catch {
    throw new ToolGrantError("bad_path", `無效路徑：${path}`);
  }
  if (norm === LEGACY_BINDINGS_D1_PATH) return BINDINGS_DB_PATH;
  return norm;
}

/**
 * Classify a normalized grant/open path.
 * Unknown `.bindings/*` → bad_path.
 */
export function classifyGrantPath(path: string): GrantPathKind {
  const norm = canonicalizeGrantPath(path);
  if (!norm) {
    throw new ToolGrantError("bad_path", "路徑不可為空");
  }
  if (norm === BINDINGS_DB_PATH) return "db";
  if (norm === BINDINGS_KV_PATH) return "kv";
  if (norm === BINDINGS_DIR || norm.startsWith(`${BINDINGS_DIR}/`)) {
    throw new ToolGrantError(
      "bad_path",
      `未知虛擬綁定路徑：${norm}（僅允許 ${BINDINGS_DB_PATH} 與 ${BINDINGS_KV_PATH}）`
    );
  }
  return "opfs";
}

export function isBindingsVirtualPath(path: string): boolean {
  try {
    const kind = classifyGrantPath(path);
    return kind === "db" || kind === "kv";
  } catch {
    return false;
  }
}

export function isBindingsDirPath(path: string): boolean {
  try {
    const n = normalizeProjectPath(path);
    return n === BINDINGS_DIR;
  } catch {
    return false;
  }
}

/** True when `path` equals a grant entry or lives under a granted directory. */
export function pathMatchesGrant(path: string, grantPaths: string[]): boolean {
  const p = canonicalizeGrantPath(path);
  for (const g of grantPaths) {
    const gg = canonicalizeGrantPath(g);
    if (p === gg || isUnderDir(p, gg)) return true;
  }
  return false;
}

/**
 * Normalize and validate a grant. Rejects empty host/paths, escapes, and
 * unknown `.bindings/*` entries. Legacy `.bindings/d1` becomes `.bindings/db`.
 */
export function normalizeGrant(input: {
  hostSandboxId?: string;
  /** @deprecated use hostSandboxId */
  hostProjectId?: string;
  paths: string[];
  mode: ToolGrantMode | string;
}): ToolGrant {
  const hostSandboxId = readHostSandboxId(input);
  if (!hostSandboxId) {
    throw new ToolGrantError("bad_grant", "grant.hostSandboxId 不可為空");
  }
  const mode = normalizeMode(input.mode);
  if (!Array.isArray(input.paths) || input.paths.length === 0) {
    throw new ToolGrantError("bad_grant", "grant.paths 不可為空");
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const raw of input.paths) {
    let norm: string;
    try {
      norm = canonicalizeGrantPath(String(raw ?? ""));
    } catch (e) {
      if (e instanceof ToolGrantError) throw e;
      throw new ToolGrantError("bad_path", `無效路徑：${String(raw)}`);
    }
    if (!norm) {
      throw new ToolGrantError("bad_path", "grant 路徑不可為空");
    }
    // Validates virtual leaves; rejects unknown .bindings/*
    classifyGrantPath(norm);
    if (seen.has(norm)) continue;
    seen.add(norm);
    paths.push(norm);
  }
  if (paths.length === 0) {
    throw new ToolGrantError("bad_grant", "grant.paths 不可為空");
  }
  return { hostSandboxId, paths, mode };
}

export function grantAllowsBinding(
  grant: ToolGrant,
  kind: BindingsVirtualKind
): boolean {
  const target = kind === "db" ? BINDINGS_DB_PATH : BINDINGS_KV_PATH;
  return pathMatchesGrant(target, grant.paths);
}

export function grantHasOpfsPaths(grant: ToolGrant): boolean {
  return grant.paths.some(p => {
    try {
      return classifyGrantPath(p) === "opfs";
    } catch {
      return false;
    }
  });
}

/**
 * Assert `path` is allowed for OPFS `op` under grant.
 * Virtual `.bindings/*` leaves are not OPFS files → bindings_virtual_not_file.
 */
export function assertPathAllowed(
  grant: ToolGrant,
  path: string,
  op: ToolPathOp
): string {
  let norm: string;
  try {
    norm = canonicalizeGrantPath(path);
  } catch {
    throw new ToolGrantError("bad_path", `無效路徑：${path}`);
  }
  if (!norm) {
    throw new ToolGrantError("bad_path", "路徑不可為空");
  }
  const kind = classifyGrantPath(norm);
  if (kind === "db" || kind === "kv") {
    throw new ToolGrantError(
      "bindings_virtual_not_file",
      `「${norm}」是虛擬綁定入口，請經 DELEGATE 的 DB／KV 存取，不可當普通檔案讀寫`
    );
  }
  if (!pathMatchesGrant(norm, grant.paths)) {
    throw new ToolGrantError("forbidden", `路徑不在授權範圍：${norm}`);
  }
  if (op === "write" && grant.mode !== "readwrite") {
    throw new ToolGrantError("forbidden", "授權為唯讀，不可寫入");
  }
  return norm;
}

/**
 * Assert grant includes the virtual binding and mode allows `op`.
 * Returns the canonical virtual path.
 */
export function assertBindingAllowed(
  grant: ToolGrant,
  kind: BindingsVirtualKind,
  op: ToolPathOp
): string {
  const target = kind === "db" ? BINDINGS_DB_PATH : BINDINGS_KV_PATH;
  if (!grantAllowsBinding(grant, kind)) {
    throw new ToolGrantError("grant_binding_required", `授權未包含 ${target}`);
  }
  if (op === "write" && grant.mode !== "readwrite") {
    throw new ToolGrantError("forbidden", "授權為唯讀，不可寫入");
  }
  return target;
}

/**
 * Focus path may be an OPFS path or a virtual bindings leaf in the grant.
 */
export function assertFocusPathAllowed(grant: ToolGrant, path: string): string {
  let norm: string;
  try {
    norm = canonicalizeGrantPath(path);
  } catch {
    throw new ToolGrantError("bad_path", `無效路徑：${path}`);
  }
  if (!norm) {
    throw new ToolGrantError("bad_path", "路徑不可為空");
  }
  const kind = classifyGrantPath(norm);
  if (kind === "db" || kind === "kv") {
    if (!pathMatchesGrant(norm, grant.paths)) {
      throw new ToolGrantError("forbidden", `路徑不在授權範圍：${norm}`);
    }
    return norm;
  }
  return assertPathAllowed(grant, norm, "read");
}

export function normalizeToolSession(input: {
  toolSandboxId?: string;
  /** @deprecated use toolSandboxId */
  toolProjectId?: string;
  hostSandboxId?: string;
  /** @deprecated use hostSandboxId */
  hostProjectId?: string;
  paths: string[];
  mode: ToolGrantMode | string;
  focusPath?: string | null;
}): ToolSession {
  const toolSandboxId = readToolSandboxId(input);
  if (!toolSandboxId) {
    throw new ToolGrantError("bad_grant", "toolSandboxId 不可為空");
  }
  const grant = normalizeGrant({
    hostSandboxId: readHostSandboxId(input),
    paths: input.paths,
    mode: input.mode,
  });
  if (toolSandboxId === grant.hostSandboxId) {
    throw new ToolGrantError("bad_grant", "工具沙盒不可與工作沙盒相同");
  }
  let focusPath: string | undefined;
  if (input.focusPath != null && String(input.focusPath).trim()) {
    focusPath = assertFocusPathAllowed(grant, String(input.focusPath));
  }
  return { toolSandboxId, grant, focusPath };
}
