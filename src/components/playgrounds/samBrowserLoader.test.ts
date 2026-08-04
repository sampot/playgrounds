import { describe, expect, it } from "vitest";
import { fileMapToSamFiles } from "./samBrowserLoader";

describe("samBrowserLoader helpers", () => {
  it("fileMapToSamFiles keeps only text paths", () => {
    const files = fileMapToSamFiles({
      "controller.js": "export default {}",
      "bin.dat": new Uint8Array([1, 2]),
    });
    expect(files["controller.js"]).toBe("export default {}");
    expect(files["bin.dat"]).toBeUndefined();
  });
});
