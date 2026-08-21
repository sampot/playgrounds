/**
 * Host-only private OPFS library UI state. Never fans out via session_file.
 */

import {
  createRoomPrivateLibrary,
  type RoomPrivateEntry,
  type RoomPrivateLibrary,
} from "./goRoomPrivateOpfs";

class GoRoomPrivateFiles {
  entries = $state<RoomPrivateEntry[]>([]);
  supported = $state(true);
  busy = $state(false);
  error = $state<string | null>(null);
  #lib: RoomPrivateLibrary | null = null;
  #attached = false;

  attach(): void {
    this.detach();
    this.#lib = createRoomPrivateLibrary();
    this.supported = this.#lib.supported;
    this.#attached = true;
    void this.refresh();
  }

  detach(): void {
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
    if (!this.#lib) return "尚未就緒";
    if (!this.#lib.supported) {
      this.error = "這台瀏覽器沒有私有片庫（需要 OPFS）。";
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
    return (await this.#lib?.getFile(id)) ?? null;
  }

  async remove(id: string): Promise<void> {
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
