/**
 * Guest `#pg=` boot: open compose SAM maximized, then shell consent modal.
 * Does not open AvatarsPanel / restore IDE chrome.
 */

import {
  composeNeedsMaximize,
  composeSamSource,
  composeSessionProtocol,
} from "./platformCompose";
import { previewInvite } from "./platformClient";
import {
  clearPgInviteHashFromLocation,
  parsePgInviteFromLocation,
} from "./platformInviteUrl";
import {
  presentPlatformInviteJoin,
  presentPlatformInviteJoinPending,
} from "./platformInviteJoinShell";
import { getPlatformComposeShell } from "./platformComposeShell";

export type ConsumePgInviteResult =
  | { handled: false }
  | { handled: true; ok: true }
  | { handled: true; ok: false; error: string };

export async function consumePgInviteFromLocation(opts?: {
  hash?: string;
  search?: string;
}): Promise<ConsumePgInviteResult> {
  const parsed = parsePgInviteFromLocation({
    hash: opts?.hash ?? (typeof window !== "undefined" ? window.location.hash : ""),
    search:
      opts?.search ??
      (typeof window !== "undefined" ? window.location.search : ""),
  });
  if (!parsed) return { handled: false };

  clearPgInviteHashFromLocation();
  presentPlatformInviteJoinPending({});

  try {
    const meta = await previewInvite(parsed.secret);
    if (meta.revoked || !meta.open) {
      presentPlatformInviteJoinPending({
        error: meta.revoked ? "邀請已撤銷" : "邀請已關閉或過期",
      });
      return { handled: true, ok: false, error: "invite_closed" };
    }

    if (meta.kind === "invite.compose") {
      const sam = composeSamSource(meta.intent);
      const shell = getPlatformComposeShell();
      // Hide IDE before install／open so consumers never flash the workspace.
      if (shell) {
        shell.enterTryPlayCanvas?.() ?? shell.maximizePreview();
      }
      if (sam && shell) {
        await shell.openSamSource(sam, { preferReuse: true });
        // Re-assert after open (layout／tabs must not restore the IDE).
        shell.enterTryPlayCanvas?.() ?? shell.maximizePreview();
      } else if (composeNeedsMaximize(meta.intent) && shell) {
        shell.enterTryPlayCanvas?.() ?? shell.maximizePreview();
      }
    }

    let displayName = "對手";
    try {
      const n = localStorage.getItem("playgrounds-roster-display-name");
      if (n?.trim()) displayName = n.trim();
    } catch {
      /* ignore */
    }

    presentPlatformInviteJoin({
      secret: parsed.secret,
      meta,
      displayName,
    });
    // Touch protocol for callers that want to arm early (optional).
    void composeSessionProtocol(meta.intent);
    return { handled: true, ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    presentPlatformInviteJoinPending({
      error: `無法讀取邀請：${message}`,
    });
    return { handled: true, ok: false, error: message };
  }
}
