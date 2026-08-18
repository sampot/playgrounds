/**
 * 包廂 file-transfer UI state — attach from guest/host room runtimes.
 */

import {
  createRoomFileTransfer,
  type RoomFileEntry,
  type RoomFileTransfer,
} from "./goRoomFileTransfer";
import type { SessionFileControl } from "@pg/roster/rosterSessionFile";

class GoRoomFiles {
  entries = $state<RoomFileEntry[]>([]);
  pendingIncoming = $state<RoomFileEntry | null>(null);
  #xfer: RoomFileTransfer | null = null;
  #unsub: (() => void) | null = null;

  attach(opts: {
    sendJson: (msg: SessionFileControl) => void;
    sendBinary: (buf: ArrayBuffer) => void;
  }): void {
    this.detach();
    this.#xfer = createRoomFileTransfer(opts);
    this.#unsub = this.#xfer.subscribe((s) => {
      this.entries = s.entries;
      this.pendingIncoming = s.pendingIncoming;
    });
  }

  detach(): void {
    this.#unsub?.();
    this.#unsub = null;
    this.#xfer?.dispose();
    this.#xfer = null;
    this.entries = [];
    this.pendingIncoming = null;
  }

  offerLocalFile(file: File) {
    return (
      this.#xfer?.offerLocalFile(file) ??
      Promise.resolve({ ok: false as const, error: "尚未連線" })
    );
  }

  acceptIncoming(id: string): boolean {
    return this.#xfer?.acceptIncoming(id) ?? false;
  }

  rejectIncoming(id: string): boolean {
    return this.#xfer?.rejectIncoming(id) ?? false;
  }

  onControl(data: unknown): void {
    this.#xfer?.onControl(data);
  }

  onBinary(buf: ArrayBuffer | Uint8Array): void {
    this.#xfer?.onBinary(buf);
  }
}

export const goRoomFiles = new GoRoomFiles();
