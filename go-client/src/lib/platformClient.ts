/**
 * Platform API origin for invite preview／join (DEC-047／050).
 * Dev: empty → same-origin Vite proxy to platform-api.
 */
export function platformApiOrigin(): string {
  const fromEnv = import.meta.env.VITE_PLATFORM_API_ORIGIN as string | undefined;
  if (typeof fromEnv === "string" && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "";
  }
  return "https://api.samkuo.me";
}

export type InvitePreview = {
  kind?: string;
  open?: boolean;
  revoked?: boolean;
  expires_at?: number;
  intent?: unknown;
};

/**
 * Resolve short id → invite secret via Platform (stub until dedicated short API).
 * Phase 1: callers may pass secret in hash; short path shows pending UI.
 */
export async function previewInviteBySecret(
  secret: string
): Promise<InvitePreview> {
  const origin = platformApiOrigin();
  const url = `${origin}/v1/invites/${encodeURIComponent(secret)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(res.status === 404 ? "邀請不存在或已失效" : "無法讀取邀請");
  }
  return (await res.json()) as InvitePreview;
}
