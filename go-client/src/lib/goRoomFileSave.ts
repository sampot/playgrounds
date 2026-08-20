/**
 * File System Access save picker for 包廂 downloads.
 * Prefer fetch(同源 URL) → pipe into a user-picked writable.
 * Safari／無 Save picker：同一條 fetch；收完 body 後用 blob: 橋接 OS 下載
 *（WebKit 下載管理員會繞過 SW，不可對 /room-file/ 用 Content-Disposition）。
 */

export type RoomFileWritable = {
  write: (data: BufferSource) => Promise<unknown> | unknown;
  close: () => Promise<unknown> | unknown;
  abort?: () => Promise<unknown> | unknown;
};

export const ROOM_FILE_SAVE_UNSUPPORTED =
  "這個瀏覽器沒辦法直接存到檔案。請用電腦或系統瀏覽器再開一次。";

export function roomFileSaveSupported(): boolean {
  return typeof globalThis.showSaveFilePicker === "function";
}

export async function pickRoomFileSave(
  suggestedName: string
): Promise<RoomFileWritable | null> {
  if (!roomFileSaveSupported()) {
    throw Object.assign(new Error(ROOM_FILE_SAVE_UNSUPPORTED), {
      code: "unsupported",
    });
  }
  try {
    const handle = await globalThis.showSaveFilePicker({
      suggestedName,
    });
    const stream = await handle.createWritable();
    return {
      write: (data) => stream.write(data),
      close: () => stream.close(),
      abort: () => stream.abort(),
    };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/** RFC 5987 Content-Disposition (legacy／tests; not used for SW download). */
export function contentDispositionAttachment(name: string): string {
  const raw = (name || "download").trim() || "download";
  const ascii = raw.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  const fallback = ascii.slice(0, 180) || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(raw)}`;
}

/**
 * Fire a blob:／object-URL browser download (Safari OS save bridge after fetch).
 */
export function triggerBrowserDownload(
  url: string,
  filename: string,
  doc: Pick<Document, "createElement" | "body"> | null =
    typeof document !== "undefined" ? document : null
): void {
  if (!doc) return;
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  a.remove();
}

export type BrowserSaveWritableDeps = {
  doc?: Pick<Document, "createElement" | "body"> | null;
  createObjectURL?: (obj: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  mime?: string;
  /**
   * When set, close() prepares a blob: URL and calls this instead of clicking
   * `<a download>` (Safari needs a fresh user gesture for the real save).
   */
  onPrepared?: (url: string, filename: string) => void;
};

/**
 * Writable that collects HTTP body chunks, then saves via blob: URL.
 * WebKit workaround only — bytes must already come from fetch(/room-file/…).
 *
 * Default: trigger download on close (tests／legacy).
 * With `onPrepared`: defer OS save to a later user click（Safari 兩段式）.
 */
export function createBrowserSaveWritable(
  filename: string,
  deps: BrowserSaveWritableDeps = {}
): RoomFileWritable {
  const chunks: Uint8Array[] = [];
  let aborted = false;
  let closed = false;
  const doc =
    deps.doc !== undefined
      ? deps.doc
      : typeof document !== "undefined"
        ? document
        : null;
  const createObjectURL =
    deps.createObjectURL ??
    ((obj: Blob) => URL.createObjectURL(obj));
  const revokeObjectURL =
    deps.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const mime = deps.mime || "application/octet-stream";
  const onPrepared = deps.onPrepared;

  return {
    write(data) {
      if (aborted || closed) return;
      if (data instanceof Uint8Array) {
        chunks.push(data.slice());
        return;
      }
      if (data instanceof ArrayBuffer) {
        chunks.push(new Uint8Array(data).slice());
        return;
      }
      const view = data as ArrayBufferView;
      chunks.push(
        new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice()
      );
    },
    close() {
      if (aborted || closed) return;
      closed = true;
      const blob = new Blob(chunks as BlobPart[], { type: mime });
      const url = createObjectURL(blob);
      if (onPrepared) {
        onPrepared(url, filename);
        return;
      }
      triggerBrowserDownload(url, filename, doc);
      setTimeout(() => {
        try {
          revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }, 60_000);
    },
    abort() {
      aborted = true;
      chunks.length = 0;
    },
  };
}

/** Stream an HTTP Response body into a save writable; returns bytes written. */
export async function pipeResponseToWritable(
  body: ReadableStream<Uint8Array> | null,
  writable: RoomFileWritable
): Promise<number> {
  if (!body) {
    throw new Error("下載失敗");
  }
  const reader = body.getReader();
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value?.byteLength) {
        written += value.byteLength;
        await writable.write(value);
      }
    }
    await writable.close();
    return written;
  } catch (e) {
    try {
      await writable.abort?.();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
