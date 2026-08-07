/**
 * Guest Platform Invite join surface (consent over maximized canvas).
 * Parallel to Host share modal — not AvatarsPanel / IDE chrome.
 */

import type { InviteMeta } from "./platformClient";

export type PlatformInviteJoinPayload = {
  secret: string;
  meta: InviteMeta;
  /** Optional prefilled display name. */
  displayName?: string;
};

/** Pending／error before consent payload is ready. */
export type PlatformInviteJoinPendingOpts = {
  error?: string | null;
  /**
   * Scanner／private context cannot write OPFS — show「請用 Safari 開啟」recovery.
   */
  recovery?: "open_in_safari";
  /** Deep link to copy when recovery is shown. */
  copyUrl?: string | null;
};

export type PlatformInviteJoinShell = {
  present: (payload: PlatformInviteJoinPayload) => void;
  /** Show load／error before meta is ready. */
  presentPending?: (opts: PlatformInviteJoinPendingOpts) => void;
  dismiss?: () => void;
};

let shell: PlatformInviteJoinShell | null = null;
let queued: PlatformInviteJoinPayload | null = null;
let queuedPending: PlatformInviteJoinPendingOpts | null = null;

export function registerPlatformInviteJoinShell(
  next: PlatformInviteJoinShell | null
): () => void {
  shell = next;
  if (shell && queuedPending) {
    const p = queuedPending;
    queuedPending = null;
    shell.presentPending?.(p);
  }
  if (shell && queued) {
    const q = queued;
    queued = null;
    shell.present(q);
  }
  return () => {
    if (shell === next) shell = null;
  };
}

export function presentPlatformInviteJoin(
  payload: PlatformInviteJoinPayload
): void {
  if (shell) {
    shell.present(payload);
    return;
  }
  queued = payload;
}

export function presentPlatformInviteJoinPending(
  opts: PlatformInviteJoinPendingOpts
): void {
  if (shell?.presentPending) {
    shell.presentPending(opts);
    return;
  }
  queuedPending = opts;
}

export function dismissPlatformInviteJoin(): void {
  queued = null;
  queuedPending = null;
  shell?.dismiss?.();
}
