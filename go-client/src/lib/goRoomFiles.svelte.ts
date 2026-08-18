/**
 * 包廂 file-share UI state — attach from guest/host room runtimes.
 */

import {
  createRoomFileTransfer,
  type RoomFileEntry,
  type RoomFilePickSave,
  type RoomFileTransfer,
} from "./goRoomFileTransfer";
import type { SessionFileControl, SessionFileShareItem } from "@pg/roster/rosterSessionFile";

class GoRoomFiles {
  entries = $state<RoomFileEntry[]>([]);
  busy = $state(false);
  #xfer: RoomFileTransfer | null = null;
  #unsub: (() => void) | null = null;

  attach(opts: {
    localAgentId: string;
    localName: string;
    sendJson: (msg: SessionFileControl) => void;
    sendBinary: (buf: ArrayBuffer, destPeerId?: string) => void;
    bufferedAmount?: (destPeerId?: string) => number;
  }): void {
    this.detach();
    this.#xfer = createRoomFileTransfer(opts);
    this.#unsub = this.#xfer.subscribe((s) => {
      this.entries = s.entries;
      this.busy = s.busy;
    });
  }

  detach(): void {
    this.#unsub?.();
    this.#unsub = null;
    this.#xfer?.dispose();
    this.#xfer = null;
    this.entries = [];
    this.busy = false;
  }

  shareLocalFile(file: File) {
    return (
      this.#xfer?.shareLocalFile(file) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  unshareLocal(id: string): boolean {
    return this.#xfer?.unshareLocal(id) ?? false;
  }

  download(id: string, pickSave: RoomFilePickSave) {
    return (
      this.#xfer?.download(id, pickSave) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  catalogItems(): SessionFileShareItem[] {
    return this.#xfer?.catalogItems() ?? [];
  }

  listingOwner(fileId: string): string | null {
    const e = this.#xfer?.getState().entries.find((x) => x.id === fileId);
    return e?.ownerId ?? null;
  }

  forgetOwner(ownerId: string): string[] {
    return this.#xfer?.forgetOwner(ownerId) ?? [];
  }

  onControl(data: unknown): void {
    this.#xfer?.onControl(data);
  }

  onBinary(buf: ArrayBuffer | Uint8Array): void {
    this.#xfer?.onBinary(buf);
  }
}

export const goRoomFiles = new GoRoomFiles();
