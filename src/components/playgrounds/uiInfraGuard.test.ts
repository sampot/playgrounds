import { describe, expect, it } from "vitest";
import { fileMapHasController, resolveCanvasApiRoute } from "./uiInfraGuard";

describe("uiInfraGuard (S7 — UI → functions)", () => {
  it("detects controller.js text entry", () => {
    expect(fileMapHasController({})).toBe(false);
    expect(fileMapHasController({ "controller.js": "export default {}" })).toBe(
      true
    );
  });

  it("canvas /api always routes to functions (even with controller)", () => {
    expect(resolveCanvasApiRoute({ "app.js": "x" })).toEqual({
      kind: "functions",
    });
    expect(
      resolveCanvasApiRoute({ "controller.js": "export default {}" })
    ).toEqual({ kind: "functions" });
  });
});
