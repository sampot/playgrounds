/**
 * Shell-owned Platform invite share surface (QR／短網址).
 * Survives maximized canvas — presented above the field chrome, not inside iframe.
 */

export type PlatformInviteSharePayload = {
  shortUrl: string;
  deepLink?: string;
  expiresAt?: string;
  kind?: string;
  title?: string;
  hint?: string;
};

export type PlatformInviteShareShell = {
  present: (payload: PlatformInviteSharePayload) => void;
  dismiss?: () => void;
};

let shell: PlatformInviteShareShell | null = null;

export function registerPlatformInviteShareShell(
  next: PlatformInviteShareShell | null
): () => void {
  shell = next;
  return () => {
    if (shell === next) shell = null;
  };
}

export function getPlatformInviteShareShell(): PlatformInviteShareShell | null {
  return shell;
}

/** Present share UI if a shell is registered; no-op otherwise. */
export function presentPlatformInviteShare(
  payload: PlatformInviteSharePayload
): void {
  shell?.present(payload);
}
