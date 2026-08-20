import { afterEach, describe, expect, it, vi } from "vitest";
import {
  roomFileSaveSupported,
  ROOM_FILE_SAVE_UNSUPPORTED,
  pipeResponseToWritable,
  createBrowserSaveWritable,
  triggerBrowserDownload,
  contentDispositionAttachment,
  type RoomFileWritable,
} from "./goRoomFileSave";

describe("pickRoomFileSave", () => {
  it("is unsupported without showSaveFilePicker", () => {
    expect(roomFileSaveSupported()).toBe(false);
    expect(ROOM_FILE_SAVE_UNSUPPORTED).toMatch(/系統瀏覽器|電腦/);
  });
});

describe("createBrowserSaveWritable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("buffers HTTP chunks and fires a blob: download on close", async () => {
    const clicks: { href: string; download: string }[] = [];
    const a = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push({ href: this.href, download: this.download });
      },
      remove() {},
    };
    const doc = {
      createElement: () => a as unknown as HTMLAnchorElement,
      body: { appendChild: () => a as unknown as HTMLAnchorElement },
    };
    const createObjectURL = vi.fn(() => "blob:test-1");
    const revokeObjectURL = vi.fn();
    const writable = createBrowserSaveWritable("clip.bin", {
      doc,
      createObjectURL,
      revokeObjectURL,
    });
    await writable.write(new Uint8Array([1, 2]));
    await writable.write(new Uint8Array([3]));
    expect(clicks).toHaveLength(0);
    await writable.close();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]![0] as Blob;
    expect(blob.size).toBe(3);
    expect(clicks).toEqual([{ href: "blob:test-1", download: "clip.bin" }]);
  });

  it("defers the OS save when onPrepared is set (Safari two-step)", async () => {
    const clicks: string[] = [];
    const prepared: { url: string; name: string }[] = [];
    const a = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push(this.href);
      },
      remove() {},
    };
    const doc = {
      createElement: () => a as unknown as HTMLAnchorElement,
      body: { appendChild: () => a as unknown as HTMLAnchorElement },
    };
    const writable = createBrowserSaveWritable("clip.bin", {
      doc,
      createObjectURL: () => "blob:ready-1",
      revokeObjectURL: () => {},
      onPrepared: (url, name) => prepared.push({ url, name }),
    });
    await writable.write(new Uint8Array([1, 2, 3]));
    await writable.close();
    expect(prepared).toEqual([{ url: "blob:ready-1", name: "clip.bin" }]);
    expect(clicks).toHaveLength(0);
    triggerBrowserDownload(prepared[0]!.url, prepared[0]!.name, doc);
    expect(clicks).toEqual(["blob:ready-1"]);
  });

  it("does not fire a download when aborted", async () => {
    const clicks: string[] = [];
    const a = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push(this.href);
      },
      remove() {},
    };
    const doc = {
      createElement: () => a as unknown as HTMLAnchorElement,
      body: { appendChild: () => a as unknown as HTMLAnchorElement },
    };
    const createObjectURL = vi.fn(() => "blob:x");
    const writable = createBrowserSaveWritable("a.bin", {
      doc,
      createObjectURL,
      revokeObjectURL: () => {},
    });
    await writable.write(new Uint8Array([9]));
    await writable.abort?.();
    expect(clicks).toHaveLength(0);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe("contentDispositionAttachment", () => {
  it("builds Content-Disposition attachment for Unicode names", () => {
    const h = contentDispositionAttachment("夏日.mp4");
    expect(h).toMatch(/^attachment;/);
    expect(h).toContain("filename*=");
    expect(h).toContain(encodeURIComponent("夏日.mp4"));
  });
});

describe("triggerBrowserDownload", () => {
  it("clicks a temporary <a download> for the given URL", () => {
    const clicks: { href: string; download: string }[] = [];
    const a = {
      href: "",
      download: "",
      rel: "",
      style: { display: "" },
      click() {
        clicks.push({ href: this.href, download: this.download });
      },
      remove() {},
    };
    const doc = {
      createElement: () => a as unknown as HTMLAnchorElement,
      body: { appendChild: () => a as unknown as HTMLAnchorElement },
    };
    triggerBrowserDownload("blob:abc", "a.txt", doc);
    expect(clicks).toEqual([{ href: "blob:abc", download: "a.txt" }]);
  });
});

describe("pipeResponseToWritable", () => {
  it("streams HTTP body chunks into the writable and returns byte count", async () => {
    const parts: Uint8Array[] = [];
    const writable: RoomFileWritable = {
      write: (data) => {
        parts.push(
          data instanceof Uint8Array
            ? data
            : new Uint8Array(data as ArrayBuffer)
        );
      },
      close: () => {},
    };
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2]));
        c.enqueue(new Uint8Array([3]));
        c.close();
      },
    });
    expect(await pipeResponseToWritable(body, writable)).toBe(3);
    expect(parts.map((p) => Array.from(p))).toEqual([
      [1, 2],
      [3],
    ]);
  });

  it("rejects a null body", async () => {
    const writable: RoomFileWritable = {
      write: () => {},
      close: () => {},
    };
    await expect(pipeResponseToWritable(null, writable)).rejects.toThrow(
      /下載失敗/
    );
  });

  it("aborts the writable when the stream errors", async () => {
    let aborted = false;
    const writable: RoomFileWritable = {
      write: () => {},
      close: () => {},
      abort: () => {
        aborted = true;
      },
    };
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.error(new Error("boom"));
      },
    });
    await expect(pipeResponseToWritable(body, writable)).rejects.toThrow(/boom/);
    expect(aborted).toBe(true);
  });
});
