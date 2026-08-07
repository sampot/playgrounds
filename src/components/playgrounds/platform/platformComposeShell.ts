/**
 * Bridge PlaygroundsApp ↔ Platform redeem for invite.compose (DEC-047).
 */

export type PlatformComposeShell = {
  /**
   * Install／open compose SAM. Guest invite path should reuse an existing
   * same-source sandbox when present (no conflict dialog; less OPFS write).
   */
  openSamSource: (
    source: string,
    opts?: { preferReuse?: boolean }
  ) => Promise<void>;
  maximizePreview: () => void;
  /**
   * Consumer play surface (same as `view=canvas` try-play): maximize canvas and
   * keep IDE chrome hidden until「看原始碼」.
   */
  enterTryPlayCanvas?: () => void;
  /** Current work-canvas sandbox id (for seating human-visible preview). */
  getActiveSandboxId?: () => string | null;
};

let shell: PlatformComposeShell | null = null;

export function registerPlatformComposeShell(
  next: PlatformComposeShell | null
): () => void {
  shell = next;
  return () => {
    if (shell === next) shell = null;
  };
}

export function getPlatformComposeShell(): PlatformComposeShell | null {
  return shell;
}
