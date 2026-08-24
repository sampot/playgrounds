/**
 * pg-booth-desktop bridge (Tauri shell).
 * Web builds: all functions no-op / false. Desktop: invoke Rust IPC.
 */

export type BoothDesktopRuntimeInfo = {
  engineMode: "desktop";
  product: string;
  version: string;
  persistentHub: boolean;
};

export type BoothDesktopPaths = {
  dataDir: string;
  shareLibraryDir: string;
  privateLibraryDir: string;
  credentialsPath: string;
  shellTokenPath: string;
};

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

type TauriGlobal = {
  core?: {
    invoke: TauriInvoke;
  };
};

function tauriInvoke(): TauriInvoke | null {
  if (typeof window === "undefined") return null;
  const tauri = (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;
  return tauri?.core?.invoke ?? null;
}

/** True when running inside pg-booth-desktop WebView. */
export function isBoothDesktopShell(): boolean {
  return tauriInvoke() != null;
}

/** Open a URL in the system browser (pg-booth-desktop) or a new tab (fallback). */
export async function boothDesktopOpenExternal(url: string): Promise<void> {
  const target = url.trim();
  if (!target) return;
  const invoke = tauriInvoke();
  if (invoke) {
    await invoke("booth_open_external", { url: target });
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

export async function boothDesktopRuntimeInfo(): Promise<BoothDesktopRuntimeInfo | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  return invoke<BoothDesktopRuntimeInfo>("booth_runtime_info");
}

export async function boothDesktopPaths(): Promise<BoothDesktopPaths | null> {
  const invoke = tauriInvoke();
  if (!invoke) return null;
  return invoke<BoothDesktopPaths>("booth_paths");
}
