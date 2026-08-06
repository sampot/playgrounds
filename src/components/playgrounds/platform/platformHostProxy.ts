/**
 * Shell proxy for Platform Invite APIs (DEC-047／DASH-SPEC §7).
 * Reads PLAYGROUNDS_API_KEY from SecretStore; never returns the key to SAM.
 */

import {
  HostBridgeError,
  type HostCreatePlatformInviteOptions,
  type HostRevokePlatformInviteOptions,
} from "../hostBridge";
import { getSecretPlaintext, getSecretStoreStatus } from "../secretStore";
import {
  createPlatformInvite as createInviteHttp,
  PLAYGROUNDS_API_KEY_SECRET,
  revokePlatformInvite as revokeInviteHttp,
  type CreateInviteResult,
} from "./platformClient";

async function resolvePlaygroundsApiKey(): Promise<string> {
  const status = await getSecretStoreStatus();
  if (status.state === "absent") {
    throw new HostBridgeError(
      "secret_absent",
      `尚未建立密鑰庫 — 請先解鎖並寫入 ${PLAYGROUNDS_API_KEY_SECRET}`
    );
  }
  if (status.state === "locked") {
    throw new HostBridgeError(
      "secret_locked",
      `請先解鎖密鑰庫後再鑄場邀請（需要 ${PLAYGROUNDS_API_KEY_SECRET}）`
    );
  }
  try {
    const key = await getSecretPlaintext(PLAYGROUNDS_API_KEY_SECRET);
    if (!key.trim()) {
      throw new HostBridgeError(
        "secret_not_found",
        `密鑰庫沒有 ${PLAYGROUNDS_API_KEY_SECRET} — 請在後台建立 API key 後寫入`
      );
    }
    return key;
  } catch (e) {
    if (e instanceof HostBridgeError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "secret_locked") {
      throw new HostBridgeError(
        "secret_locked",
        `請先解鎖密鑰庫後再鑄場邀請（需要 ${PLAYGROUNDS_API_KEY_SECRET}）`
      );
    }
    if (msg === "secret_not_found") {
      throw new HostBridgeError(
        "secret_not_found",
        `密鑰庫沒有 ${PLAYGROUNDS_API_KEY_SECRET} — 請在後台建立 API key 後寫入`
      );
    }
    throw new HostBridgeError("secret_error", msg);
  }
}

function defaultTargetField(): string {
  if (typeof location !== "undefined" && location.host) {
    return location.host;
  }
  return "play.samkuo.me";
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
  const apiKey = await resolvePlaygroundsApiKey();
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
  const apiKey = await resolvePlaygroundsApiKey();
  try {
    await revokeInviteHttp({ inviteId, apiKey });
    return { ok: true };
  } catch (e) {
    mapPlatformHttpError(e, "revoke_invite_failed");
  }
}
