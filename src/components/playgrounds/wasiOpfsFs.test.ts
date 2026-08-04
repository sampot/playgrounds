import { describe, expect, it } from "vitest";
import { File } from "@bjorn3/browser_wasi_shim";
import { DirtySyncOPFSFile, type SyncAccessHandleLike } from "./wasiOpfsFs";

function mockHandle(initial = new Uint8Array()): SyncAccessHandleLike {
  let data = initial.slice();
  return {
    close() {},
    flush() {},
    getSize() {
      return data.byteLength;
    },
    read(buffer, options) {
      const at = options?.at ?? 0;
      const view =
        buffer instanceof Uint8Array
          ? buffer
          : new Uint8Array(buffer as ArrayBuffer);
      const n = Math.min(view.byteLength, data.byteLength - at);
      view.set(data.subarray(at, at + n));
      return n;
    },
    truncate(to) {
      if (to < data.byteLength) data = data.subarray(0, to);
      else {
        const next = new Uint8Array(to);
        next.set(data);
        data = next;
      }
    },
    write(buffer, options) {
      const at = options?.at ?? 0;
      const src =
        buffer instanceof Uint8Array
          ? buffer
          : new Uint8Array(buffer as ArrayBuffer);
      if (at + src.byteLength > data.byteLength) {
        const next = new Uint8Array(at + src.byteLength);
        next.set(data);
        data = next;
      }
      data.set(src, at);
      return src.byteLength;
    },
  };
}

describe("DirtySyncOPFSFile", () => {
  it("marks dirty on write and truncate-open", () => {
    const f = new DirtySyncOPFSFile(
      "a.bin",
      mockHandle(new Uint8Array([1, 2]))
    );
    expect(f.dirty).toBe(false);
    const opened = f.path_open(0, BigInt(0xffff_ffff), 0);
    expect(opened.ret).toBe(0);
    expect(opened.fd_obj).toBeTruthy();
    opened.fd_obj!.fd_write(new Uint8Array([9]));
    expect(f.dirty).toBe(true);
  });

  it("stays distinct from mem File", () => {
    const f = new DirtySyncOPFSFile("x", mockHandle());
    expect(f instanceof File).toBe(false);
  });
});
