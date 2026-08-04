import { describe, expect, it } from "vitest";
import { cloneFileMapForTransfer, type FileMap } from "./projectTypes";

describe("cloneFileMapForTransfer", () => {
  it("produces a structured-cloneable map from a Proxy (Svelte $state-like)", () => {
    const raw: FileMap = {
      "app.js": "export default {}",
      "bin.apk": new Uint8Array([1, 2, 3]),
    };
    const proxied = new Proxy(raw, {});
    expect(() => structuredClone(proxied)).toThrow();

    const plain = cloneFileMapForTransfer(proxied);
    expect(plain).not.toBe(proxied);
    expect(structuredClone(plain)).toEqual({
      "app.js": "export default {}",
      "bin.apk": new Uint8Array([1, 2, 3]),
    });
    expect(plain["bin.apk"]).toBeInstanceOf(Uint8Array);
    expect(plain["bin.apk"]).not.toBe(raw["bin.apk"]);
  });

  it("skips unexpected value types", () => {
    const weird = {
      ok: "text",
      bad: { nested: true },
    } as unknown as FileMap;
    expect(cloneFileMapForTransfer(weird)).toEqual({ ok: "text" });
  });
});
