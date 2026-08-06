/**
 * Bridge PlaygroundsApp ↔ Platform redeem for invite.compose (DEC-047).
 */

export type PlatformComposeShell = {
  openSamSource: (source: string) => Promise<void>;
  maximizePreview: () => void;
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
