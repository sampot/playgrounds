import type { HostShareLibrary } from "../goRoomShareTypes";

export type HostShareCatalogEntry = {
  id: string;
  name: string;
  size: number;
  mime?: string;
  relativePath: string;
  file: File;
};

export type BoothShareCatalogSync = {
  start(): Promise<void>;
  stop(): void;
  rescan(): Promise<void>;
  shareLibraryDir(): Promise<string | null>;
};

const DEFAULT_RESCAN_MS = 30_000;

export function createBoothShareCatalogSync(opts: {
  library: HostShareLibrary;
  syncCatalog: (entries: HostShareCatalogEntry[]) => void;
  rescanIntervalMs?: number;
}): BoothShareCatalogSync {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inflight: Promise<void> | null = null;

  async function rescanInner(): Promise<void> {
    const listed = await opts.library.scan();
    const entries: HostShareCatalogEntry[] = [];
    for (const item of listed) {
      entries.push({
        id: item.id,
        name: item.name,
        size: item.size,
        mime: item.mime,
        relativePath: item.relativePath,
        file: await opts.library.loadFile(item),
      });
    }
    opts.syncCatalog(entries);
  }

  async function rescan(): Promise<void> {
    if (inflight) return inflight;
    inflight = rescanInner().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    async start() {
      await rescan();
      if (timer) return;
      const ms = opts.rescanIntervalMs ?? DEFAULT_RESCAN_MS;
      timer = setInterval(() => {
        void rescan();
      }, ms);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    rescan,
    shareLibraryDir: () => opts.library.shareLibraryDir(),
  };
}
