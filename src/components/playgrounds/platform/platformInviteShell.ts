/**
 * Bridge work-canvas Host SAM ↔ Platform invite mint + answer loop (DEC-047).
 * Hidden roster transport registers the implementation (peer handlers).
 */

export type PlatformInviteMintResult = {
  invite_id: string;
  kind: string;
  /** Unix ms (Platform API). */
  expires_at: number;
  short_url: string;
  deep_link: string;
  secret: string;
};

export type PlatformInviteShell = {
  /** Mint invite and keep Host Ticket answer loop running. */
  mintAndAnswer: (opts: {
    kind?: string;
    intent?: unknown;
    ttlMs?: number;
  }) => Promise<PlatformInviteMintResult>;
  /** Prefer seating this sandbox on session invite accept (human-visible canvas). */
  getPreferSeatSandboxId?: () => string | null;
};

let shell: PlatformInviteShell | null = null;

export function registerPlatformInviteShell(
  next: PlatformInviteShell | null
): () => void {
  shell = next;
  return () => {
    if (shell === next) shell = null;
  };
}

export function getPlatformInviteShell(): PlatformInviteShell | null {
  return shell;
}
