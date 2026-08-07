/**
 * Shell proxy for Platform Invite APIs (DEC-047／DASH-SPEC §7).
 * Reads field API key from shell memory (provision); never returns the key to SAM.
 */

import {
  HostBridgeError,
  type HostCreatePlatformInviteOptions,
  type HostRevokePlatformInviteOptions,
} from "../hostBridge";
import { getPlatformFieldApiKey } from "./platformFieldCredential";
import {
  createPlatformInvite as createInviteHttp,
  revokePlatformInvite as revokeInviteHttp,
  type CreateInviteResult,
} from "./platformClient";

function resolvePlaygroundsApiKey(): string {
  const key = getPlatformFieldApiKey();
  if (!key) {
    throw new HostBridgeError(
      "not_provisioned",
      "尚未登入遊樂場通行證 — 請按工具列「登入」"
    );
  }
  return key;
}

function defaultTargetField(): string {
  if (typeof location !== "undefined" && location.origin) {
    return location.origin;
  }
  return "https://play.samkuo.me";
}

function mapPlatformHttpError(e: unknown, fallback: string): never {
  if (e instanceof HostBridgeError) throw e;
  const err = e as Error & { status?: number; data?: { error?: string } };
  const code =
    (err.data && typeof err.data.error === "string" && err.data.error) ||
    err.message ||
    fallback;
  throw new HostBridgeError(
    code,
    `Platform API：${code}${err.status ? `（HTTP ${err.status}）` : ""}`
  );
}

/** HOST.createPlatformInvite — SAM-facing; key stays in shell memory only. */
export async function hostCreatePlatformInvite(
  options: HostCreatePlatformInviteOptions = {}
): Promise<CreateInviteResult> {
  const apiKey = resolvePlaygroundsApiKey();
  try {
    return await createInviteHttp({
      apiKey,
      kind: options.kind,
      intent: options.intent,
      targetField: options.targetField?.trim() || defaultTargetField(),
      ttlMs: options.ttlMs,
    });
  } catch (e) {
    mapPlatformHttpError(e, "create_invite_failed");
  }
}

/** HOST.revokePlatformInvite — SAM-facing. */
export async function hostRevokePlatformInvite(
  options: HostRevokePlatformInviteOptions
): Promise<{ ok: true }> {
  const inviteId = options?.inviteId?.trim();
  if (!inviteId) {
    throw new HostBridgeError("bad_args", "revokePlatformInvite 需要 inviteId");
  }
  const apiKey = resolvePlaygroundsApiKey();
  try {
    await revokeInviteHttp({ inviteId, apiKey });
    return { ok: true };
  } catch (e) {
    mapPlatformHttpError(e, "revoke_invite_failed");
  }
}
