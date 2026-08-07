/**
 * Bridge: shell-owned guest consent → AvatarsPanel WebRTC／session_invite plumbing.
 * AvatarsPanel remains connection transport; product consent UI stays out of it.
 */

import type { InviteMeta } from "./platformClient";

export type PlatformGuestJoinBridge = {
  setLocalDisplayName: (name: string) => void;
  /**
   * Arm compose auto-accept (optional protocolId) then Platform ticket + Roster offer.
   */
  joinTicket: (opts: {
    secret: string;
    meta: InviteMeta;
    composeProtocolId?: string | null;
  }) => Promise<void>;
};

let bridge: PlatformGuestJoinBridge | null = null;
const waiters: Array<() => void> = [];

export function registerPlatformGuestJoinBridge(
  next: PlatformGuestJoinBridge | null
): () => void {
  bridge = next;
  if (bridge) {
    const q = waiters.splice(0, waiters.length);
    for (const wake of q) wake();
  }
  return () => {
    if (bridge === next) bridge = null;
  };
}

export function getPlatformGuestJoinBridge(): PlatformGuestJoinBridge | null {
  return bridge;
}

async function waitForBridge(
  timeoutMs = 8000
): Promise<PlatformGuestJoinBridge> {
  if (bridge) return bridge;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const i = waiters.indexOf(wake);
      if (i >= 0) waiters.splice(i, 1);
      reject(new Error("連線模組尚未就緒，請稍候再試"));
    }, timeoutMs);
    const wake = () => {
      clearTimeout(timer);
      if (bridge) resolve(bridge);
      else reject(new Error("連線模組尚未就緒，請稍候再試"));
    };
    waiters.push(wake);
  });
}

export async function guestJoinPlatformTicket(opts: {
  secret: string;
  meta: InviteMeta;
  composeProtocolId?: string | null;
  displayName?: string;
}): Promise<void> {
  const b = await waitForBridge();
  if (opts.displayName?.trim()) {
    b.setLocalDisplayName(opts.displayName.trim());
  }
  await b.joinTicket({
    secret: opts.secret,
    meta: opts.meta,
    composeProtocolId: opts.composeProtocolId,
  });
}
