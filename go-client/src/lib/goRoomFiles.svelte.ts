/**
 * 包廂 file-share UI state — attach from guest/host room runtimes.
 */

import type {
  RoomFileEntry,
  RoomFilePickSave,
  RoomFilePlayback,
  RoomFileTransfer,
} from "./goRoomFileTransfer";
import { fileShareKind } from "./goRoomFileShare";
import type { SessionFileControl, SessionFileShareItem } from "@pg/roster/rosterSessionFile";

class GoRoomFiles {
  entries = $state<RoomFileEntry[]>([]);
  busy = $state(false);
  playback = $state<RoomFilePlayback | null>(null);
  #xfer: RoomFileTransfer | null = null;
  #unsub: (() => void) | null = null;
  #unlistenNeed: (() => void) | null = null;
  #unlistenTransferEnd: (() => void) | null = null;
  #unlistenSaveCancel: (() => void) | null = null;
  #attachGen = 0;
  #pendingControl: unknown[] = [];
  #pendingBinary: ArrayBuffer[] = [];
  #operatorMirror = false;
  #remoteShareImport: ((files: File[]) => Promise<string | null>) | null = null;
  #remoteUnshare: ((id: string) => Promise<string | null>) | null = null;
  #remoteDownload: ((id: string) => Promise<string | null>) | null = null;

  attach(opts: {
    localAgentId: string;
    localName: string;
    sendJson: (msg: SessionFileControl) => void;
    sendBinary: (buf: ArrayBuffer, destPeerId?: string) => void;
    bufferedAmount?: (destPeerId?: string) => number;
  }): void {
    this.detach();
    const gen = ++this.#attachGen;
    void this.#boot(opts, gen);
  }

  async #boot(
    opts: {
      localAgentId: string;
      localName: string;
      sendJson: (msg: SessionFileControl) => void;
      sendBinary: (buf: ArrayBuffer, destPeerId?: string) => void;
      bufferedAmount?: (destPeerId?: string) => number;
    },
    gen: number
  ): Promise<void> {
    const [{ createRoomFileTransfer }, { listenRoomOpenTransfer, listenRoomTransferEnd, listenRoomPlaySaveCancel }] =
      await Promise.all([
        import("./goRoomFileTransfer"),
        import("./goRoomPlayBridge"),
      ]);
    if (gen !== this.#attachGen) return;

    this.#xfer = createRoomFileTransfer(opts);
    this.#unsub = this.#xfer.subscribe((s) => {
      this.entries = s.entries;
      this.busy = s.busy;
      if (
        this.playback?.id === s.playback?.id &&
        this.playback?.url === s.playback?.url
      ) {
        return;
      }
      this.playback = s.playback;
    });
    this.#unlistenNeed = listenRoomOpenTransfer((msg) => {
      this.#xfer?.acceptHttpTransfer(msg);
    });
    this.#unlistenTransferEnd = listenRoomTransferEnd((msg) => {
      this.#xfer?.noteHttpTransferEnd(msg);
    });
    this.#unlistenSaveCancel = listenRoomPlaySaveCancel((playId) => {
      this.#xfer?.cancelHttpSave(playId);
    });

    const ctrl = this.#pendingControl.splice(0);
    const bins = this.#pendingBinary.splice(0);
    for (const data of ctrl) this.#xfer.onControl(data);
    for (const buf of bins) this.#xfer.onBinary(buf);
  }

  detach(): void {
    this.#attachGen++;
    this.#pendingControl = [];
    this.#pendingBinary = [];
    this.#unlistenNeed?.();
    this.#unlistenNeed = null;
    this.#unlistenTransferEnd?.();
    this.#unlistenTransferEnd = null;
    this.#unlistenSaveCancel?.();
    this.#unlistenSaveCancel = null;
    this.#unsub?.();
    this.#unsub = null;
    this.#xfer?.dispose();
    this.#xfer = null;
    this.entries = [];
    this.busy = false;
    this.playback = null;
  }

  /** Operator Shell: share catalog from booth snapshot + remote handlers. */
  attachOperatorMirror(opts: {
    importFiles: (files: File[]) => Promise<string | null>;
    unshare: (id: string) => Promise<string | null>;
    download: (id: string) => Promise<string | null>;
  }): void {
    this.#operatorMirror = true;
    this.#remoteShareImport = opts.importFiles;
    this.#remoteUnshare = opts.unshare;
    this.#remoteDownload = opts.download;
  }

  clearOperatorMirror(): void {
    this.#operatorMirror = false;
    this.#remoteShareImport = null;
    this.#remoteUnshare = null;
    this.#remoteDownload = null;
    if (!this.#xfer) {
      this.entries = [];
      this.busy = false;
      this.playback = null;
    }
  }

  /** Operator Shell: read-only share catalog from booth snapshot. */
  setMirrorEntries(entries: RoomFileEntry[]): void {
    if (this.#xfer) return;
    this.entries = entries;
    this.busy = false;
    this.playback = null;
  }

  clearMirrorEntries(): void {
    if (this.#xfer) return;
    this.entries = [];
    this.busy = false;
    this.playback = null;
  }

  async unshareRemote(id: string): Promise<string | null> {
    if (!this.#operatorMirror || !this.#remoteUnshare) return "尚未就緒";
    this.busy = true;
    try {
      return await this.#remoteUnshare(id);
    } finally {
      this.busy = false;
    }
  }

  async downloadRemote(id: string): Promise<string | null> {
    if (!this.#operatorMirror || !this.#remoteDownload) return "尚未就緒";
    return this.#remoteDownload(id);
  }

  shareLocalFile(file: File) {
    if (this.#operatorMirror && this.#remoteShareImport) {
      this.busy = true;
      return this.#remoteShareImport([file])
        .then((err) => {
          if (err) return { ok: false as const, error: err };
          return { ok: true as const };
        })
        .finally(() => {
          this.busy = false;
        });
    }
    return (
      this.#xfer?.shareLocalFile(file) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  shareLocalDirectory(files: File[]) {
    return (
      this.#xfer?.shareLocalDirectory(files) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  localFile(id: string): File | null {
    return this.#xfer?.localFile(id) ?? null;
  }

  unshareLocal(id: string): boolean {
    return this.#xfer?.unshareLocal(id) ?? false;
  }

  unshare(id: string, opts?: { host?: boolean }): boolean {
    return this.#xfer?.unshare(id, opts) ?? false;
  }

  download(id: string, pickSave: RoomFilePickSave) {
    return (
      this.#xfer?.download(id, pickSave) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  cancelDownload(id: string): void {
    this.#xfer?.cancelDownload(id);
  }

  primeBrowserDownload(id: string) {
    return (
      this.#xfer?.primeBrowserDownload(id) ?? {
        ok: false as const,
        error: "尚未連線",
      }
    );
  }

  play(id: string) {
    return (
      this.#xfer?.play(id) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  seekPlay(offset: number) {
    return (
      this.#xfer?.seekPlay(offset) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  stopPlay(): void {
    this.#xfer?.stopPlay();
  }

  notePlayhead(seconds: number): void {
    this.#xfer?.notePlayhead(seconds);
  }

  catalogItems(): SessionFileShareItem[] {
    return this.#xfer?.catalogItems() ?? [];
  }

  listingOwner(fileId: string): string | null {
    const e = this.#xfer?.getState().entries.find((x) => x.id === fileId);
    return e?.ownerId ?? null;
  }

  listingMeta(
    fileId: string
  ): { name: string; kind: "audio" | "video" } | null {
    const e = this.#xfer?.getState().entries.find((x) => x.id === fileId);
    if (!e) return null;
    const kind = fileShareKind({ mime: e.mime, name: e.name });
    return {
      name: e.name,
      kind: kind === "audio" ? "audio" : "video",
    };
  }

  forgetOwner(ownerId: string): string[] {
    return this.#xfer?.forgetOwner(ownerId) ?? [];
  }

  onControl(data: unknown): void {
    if (!this.#xfer) {
      this.#pendingControl.push(data);
      return;
    }
    this.#xfer.onControl(data);
  }

  onBinary(buf: ArrayBuffer | Uint8Array): void {
    if (!this.#xfer) {
      const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      this.#pendingBinary.push(view.slice().buffer);
      return;
    }
    this.#xfer.onBinary(buf);
  }
}

export const goRoomFiles = new GoRoomFiles();
