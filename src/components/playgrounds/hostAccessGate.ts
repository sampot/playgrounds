/**
 * Cross-sandbox HOST FS grant checks (DEC-051 §6.5).
 */

import { getAdmittedCapabilities } from "./admittedCapabilities";
import { getDelegateGrant } from "./delegateGrantRegistry";
import {
  getHostCallerSandboxId,
  withHostCaller,
} from "./hostCallerContext";
import { HostBridgeError } from "./hostBridge";
import { grantModeForScopes } from "./hostScopeMap";
import { readMeta, updateProjectMeta } from "./sandboxAuthority";
import {
  findScopeGrant,
  normalizeScopeGrantEntry,
  SCOPE_GRANT_WHOLE_TREE,
  scopeGrantAllowsAnyPath,
  scopeGrantAllowsPath,
  upsertScopeGrant,
  type ScopeGrantEntry,
  type ScopeGrantSource,
} from "./scopeGrant";
import { pathMatchesGrant, type ToolGrantMode } from "./toolGrant";

export async function assertHostTargetAccess(opts: {
  targetSandboxId: string;
  activeAgentSandboxId: string | null;
  path?: string | null;
  needWrite: boolean;
}): Promise<void> {
  const caller = getHostCallerSandboxId();
  const steward = opts.activeAgentSandboxId;
  // No caller context (legacy／steward shell) or steward seat → full access.
  if (!caller || (steward && caller === steward)) return;
  // Own sandbox via HOST — allow (intrinsic; agent_readonly still applies separately).
  if (caller === opts.targetSandboxId) return;

  const path = opts.path?.trim() || null;

  try {
    const meta = await readMeta(opts.targetSandboxId);
    const grant = findScopeGrant(meta, caller);
    if (grant) {
      if (path) {
        if (scopeGrantAllowsPath(grant, path, opts.needWrite)) return;
      } else if (scopeGrantAllowsAnyPath(grant, opts.needWrite)) {
        return;
      }
    }
  } catch {
    /* not_found handled by caller */
  }

  const del = getDelegateGrant(caller);
  if (del && del.grant.hostSandboxId === opts.targetSandboxId) {
    if (!opts.needWrite || del.grant.mode === "readwrite") {
      if (!path || pathMatchesGrant(path, del.grant.paths)) return;
    }
  }

  throw new HostBridgeError(
    "grant_required",
    path
      ? `未授權存取沙盒 ${opts.targetSandboxId} 路徑 ${path}（需明示 grant 或建立即自動 grant）`
      : `未授權存取沙盒 ${opts.targetSandboxId}（需明示 grant 或建立即自動 grant）`
  );
}

/** Persist create-auto or explicit grant on the target sandbox. */
export async function persistScopeGrantOnTarget(opts: {
  targetSandboxId: string;
  granteeSandboxId: string;
  paths?: string[];
  mode?: ToolGrantMode;
  source: ScopeGrantSource;
}): Promise<ScopeGrantEntry> {
  const meta = await readMeta(opts.targetSandboxId);
  const entry = normalizeScopeGrantEntry({
    granteeSandboxId: opts.granteeSandboxId,
    paths: opts.paths ?? [SCOPE_GRANT_WHOLE_TREE],
    mode: opts.mode ?? "readwrite",
    source: opts.source,
  });
  const scopeGrants = upsertScopeGrant(meta.scopeGrants, entry);
  await updateProjectMeta(opts.targetSandboxId, { scopeGrants });
  return entry;
}

/** After create／clone by a non-steward scoped SAM — whole-tree auto grant. */
export async function maybeAutoGrantCreatedSandbox(opts: {
  targetSandboxId: string;
  activeAgentSandboxId: string | null;
}): Promise<ScopeGrantEntry | null> {
  const caller = getHostCallerSandboxId();
  if (!caller) return null;
  if (opts.activeAgentSandboxId && caller === opts.activeAgentSandboxId) {
    return null;
  }
  const mode = grantModeForScopes(getAdmittedCapabilities(caller));
  if (!mode) return null;
  return persistScopeGrantOnTarget({
    targetSandboxId: opts.targetSandboxId,
    granteeSandboxId: caller,
    paths: [SCOPE_GRANT_WHOLE_TREE],
    mode,
    source: "auto",
  });
}

export function wrapHostBindingWithCaller(
  host: Record<string, unknown>,
  callerSandboxId: string
): Record<string, unknown> {
  return new Proxy(host, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;
      return (...args: unknown[]) =>
        withHostCaller(callerSandboxId, () =>
          Promise.resolve(
            (value as (...a: unknown[]) => unknown).apply(target, args)
          )
        );
    },
  });
}
