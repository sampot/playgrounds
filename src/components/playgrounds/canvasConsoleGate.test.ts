import { describe, expect, it } from "vitest";
import {
  armCanvasConsoleGate,
  installCanvasConsoleGate,
  setCanvasConsoleMirror,
} from "./canvasConsoleGate";

describe("canvasConsoleGate", () => {
  it("exports install / arm / set helpers", () => {
    expect(typeof installCanvasConsoleGate).toBe("function");
    expect(typeof armCanvasConsoleGate).toBe("function");
    expect(typeof setCanvasConsoleMirror).toBe("function");
  });

  it("install is a no-op for null window", () => {
    expect(() => installCanvasConsoleGate(null, false)).not.toThrow();
    expect(() => setCanvasConsoleMirror(undefined, true)).not.toThrow();
    expect(() => armCanvasConsoleGate(null, false)).not.toThrow();
  });
});
