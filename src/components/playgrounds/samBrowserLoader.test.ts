import { describe, expect, it } from "vitest";
import {
  fileMapToSamFiles,
  listStaticRelativeImportsForTest,
} from "./samBrowserLoader";

describe("samBrowserLoader helpers", () => {
  it("fileMapToSamFiles keeps only text paths", () => {
    const files = fileMapToSamFiles({
      "controller.js": "export default {}",
      "bin.dat": new Uint8Array([1, 2]),
    });
    expect(files["controller.js"]).toBe("export default {}");
    expect(files["bin.dat"]).toBeUndefined();
  });

  it("ignores JSDoc import() type refs when scanning static deps", () => {
    const code = `
      import { createInitialState } from "./game.js";
      /**
       * @typedef {{
       *   game: import('./game.js').GameState;
       * }} Store
       */
      export default { fetch() {} };
    `;
    expect(listStaticRelativeImportsForTest(code)).toEqual(["./game.js"]);
  });
});
