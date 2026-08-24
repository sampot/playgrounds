/**
 * Host-only private library UI state. Never fans out via session_file.
 */

import { createHostPrivateLibrary } from "./goRoomPrivateLibrary";
import type { RoomPrivateEntry, RoomPrivateLibrary } from "./goRoomPrivateTypes";

class GoRoomPrivateFiles {
  entries = $state<RoomPrivateEntry[]>([]);
  supported = $state(true);
  busy = $state(false);
  error = $state<string | null>(null);
  #lib: RoomPrivateLibrary | null = null;
  #attached = false;
  #mirror = false;
  #remoteImport: ((files: File[]) => Promise<string | null>) | null = null;
  #remoteRemove: ((id: string) => Promise<void>) | null = null;
  #remoteMountToShare: ((id: string) => Promise<string | null>) | null = null;
  #remoteDownload: ((id: string) => Promise<string | null>) | null = null;

  attach(): void {
    this.detach();
    this.#lib = createHostPrivateLibrary();
    this.supported = this.#lib.supported;
    this.#attached = true;
    this.#mirror = false;
    void this.refresh();
  }

  /** Operator Shell: Hub private library metadata + remote handlers. */
  attachOperatorMirror(opts: {
    importFiles: (files: File[]) => Promise<string | null>;
    remove: (id: string) => Promise<void>;
    mountToShare: (id: string) => Promise<string | null>;
    download: (id: string) => Promise<string | null>;
  }): void {
    this.detach();
    this.#mirror = true;
    this.supported = true;
    this.#attached = true;
    this.#remoteImport = opts.importFiles;
    this.#remoteRemove = opts.remove;
    this.#remoteMountToShare = opts.mountToShare;
    this.#remoteDownload = opts.download;
  }

  setMirrorEntries(entries: RoomPrivateEntry[]): void {
    if (!this.#mirror) return;
    this.entries = entries;
    this.busy = false;
    this.error = null;
  }

  clearMirror(): void {
    if (!this.#mirror) return;
    this.entries = [];
    this.busy = false;
    this.error = null;
    this.#remoteImport = null;
    this.#remoteRemove = null;
    this.#remoteMountToShare = null;
    this.#remoteDownload = null;
    this.#mirror = false;
    this.#attached = false;
  }

  detach(): void {
    if (this.#mirror) {
      this.clearMirror();
      return;
    }
    this.#attached = false;
    this.#lib = null;
    this.entries = [];
    this.busy = false;
    this.error = null;
    this.supported = true;
  }

  async refresh(): Promise<void> {
    if (!this.#lib || !this.#attached) return;
    try {
      this.entries = await this.#lib.list();
    } catch {
      this.entries = [];
    }
  }

  async importFiles(list: FileList | File[]): Promise<string | null> {
    if (this.#mirror && this.#remoteImport) {
      this.busy = true;
      this.error = null;
      try {
        const err = await this.#remoteImport(Array.from(list));
        if (err) this.error = err;
        return err;
      } finally {
        this.busy = false;
      }
    }
    if (!this.#lib) return "尚未就緒";
    if (!this.#lib.supported) {
      this.error = "這台環境沒有私有片庫。";
      return this.error;
    }
    this.busy = true;
    this.error = null;
    try {
      for (const file of Array.from(list)) {
        const out = await this.#lib.importFile(file);
        if (!out.ok) {
          this.error = out.error;
          return out.error;
        }
      }
      await this.refresh();
      return null;
    } finally {
      this.busy = false;
    }
  }

  async getFile(id: string): Promise<File | null> {
    if (this.#mirror) return null;
    return (await this.#lib?.getFile(id)) ?? null;
  }

  async mountToShare(id: string): Promise<string | null> {
    if (this.#mirror && this.#remoteMountToShare) {
      return this.#remoteMountToShare(id);
    }
    return "尚未就緒";
  }

  async downloadRemote(id: string): Promise<string | null> {
    if (this.#mirror && this.#remoteDownload) {
      return this.#remoteDownload(id);
    }
    return "尚未就緒";
  }

  async remove(id: string): Promise<void> {
    if (this.#mirror && this.#remoteRemove) {
      this.busy = true;
      try {
        await this.#remoteRemove(id);
        this.entries = this.entries.filter((entry) => entry.id !== id);
      } finally {
        this.busy = false;
      }
      return;
    }
    if (!this.#lib) return;
    this.busy = true;
    try {
      await this.#lib.remove(id);
      await this.refresh();
    } finally {
      this.busy = false;
    }
  }
}

export const goRoomPrivateFiles = new GoRoomPrivateFiles();
