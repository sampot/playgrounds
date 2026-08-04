import { describe, expect, it, beforeEach } from "vitest";
import {
  appendWorkConsoleLine,
  clearWorkConsoleBuffer,
  listWorkConsoleLines,
  resetWorkConsoleBufferForTests,
  waitWorkConsole,
  workConsoleBufferSize,
} from "./workConsoleBuffer";

describe("workConsoleBuffer", () => {
  beforeEach(() => {
    resetWorkConsoleBufferForTests();
  });

  it("appends and lists lines with monotonic indices", () => {
    appendWorkConsoleLine("log", "a");
    appendWorkConsoleLine("error", "b");
    const all = listWorkConsoleLines();
    expect(all).toHaveLength(2);
    expect(all[0].index).toBe(0);
    expect(all[1].index).toBe(1);
    expect(all[1].text).toBe("b");
  });

  it("filters with since cursor", () => {
    appendWorkConsoleLine("log", "a");
    const mid = appendWorkConsoleLine("log", "b");
    appendWorkConsoleLine("log", "c");
    expect(listWorkConsoleLines(mid.index).map(l => l.text)).toEqual(["c"]);
  });

  it("clears contents but keeps index counter", () => {
    appendWorkConsoleLine("log", "a");
    clearWorkConsoleBuffer();
    expect(workConsoleBufferSize()).toBe(0);
    const next = appendWorkConsoleLine("log", "b");
    expect(next.index).toBe(1);
  });

  it("waitWorkConsole resolves on new lines", async () => {
    const since = -1;
    const pending = waitWorkConsole({ since, timeoutMs: 500, pollMs: 20 });
    queueMicrotask(() => appendWorkConsoleLine("log", "hello"));
    const result = await pending;
    expect(result.timedOut).toBe(false);
    expect(result.lines.some(l => l.text === "hello")).toBe(true);
  });

  it("waitWorkConsole times out", async () => {
    const result = await waitWorkConsole({
      since: 999,
      timeoutMs: 40,
      pollMs: 10,
    });
    expect(result.timedOut).toBe(true);
  });

  it("waitWorkConsole match filters", async () => {
    appendWorkConsoleLine("log", "noise");
    const since = listWorkConsoleLines().at(-1)!.index;
    const pending = waitWorkConsole({
      since,
      match: "target",
      timeoutMs: 500,
      pollMs: 15,
    });
    queueMicrotask(() => {
      appendWorkConsoleLine("log", "still noise");
      appendWorkConsoleLine("log", "hit target ok");
    });
    const result = await pending;
    expect(result.timedOut).toBe(false);
    expect(result.lines.every(l => l.text.includes("target"))).toBe(true);
  });
});
