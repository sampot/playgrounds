import { describe, expect, it } from "vitest";
import {
  consoleLinesToText,
  filterConsoleLines,
  formatConsoleTime,
  normalizeConsoleLevel,
  type ConsoleLineView,
} from "./playgroundsConsoleUi";

const sample: ConsoleLineView[] = [
  { level: "log", text: "hello", at: 1 },
  { level: "warn", text: "careful", at: 2 },
  { level: "error", text: "boom", at: 3 },
  { level: "unhandledrejection", text: "reject me", at: 4 },
  { level: "info", text: "note hello", at: 5 },
  { level: "debug", text: "trace hello", at: 6 },
];

describe("playgroundsConsoleUi", () => {
  it("normalizes log → info, warning / unhandledrejection", () => {
    expect(normalizeConsoleLevel("log")).toBe("info");
    expect(normalizeConsoleLevel("LOG")).toBe("info");
    expect(normalizeConsoleLevel("warning")).toBe("warn");
    expect(normalizeConsoleLevel("unhandledrejection")).toBe("error");
    expect(normalizeConsoleLevel("DEBUG")).toBe("debug");
  });

  it("filters by level and query (log counts as info)", () => {
    expect(
      filterConsoleLines(sample, { level: "error", query: "" }).map(l => l.text)
    ).toEqual(["boom", "reject me"]);
    expect(
      filterConsoleLines(sample, { level: "info", query: "" }).map(l => l.text)
    ).toEqual(["hello", "note hello"]);
    expect(
      filterConsoleLines(sample, { level: "all", query: "hello" }).map(
        l => l.text
      )
    ).toEqual(["hello", "note hello", "trace hello"]);
    expect(
      filterConsoleLines(sample, { level: "warn", query: "care" }).map(
        l => l.text
      )
    ).toEqual(["careful"]);
    expect(
      filterConsoleLines(sample, { level: "debug", query: "" }).map(l => l.text)
    ).toEqual(["trace hello"]);
  });

  it("formats local time with milliseconds", () => {
    const at = new Date(2026, 7, 2, 5, 10, 30, 123).getTime();
    expect(formatConsoleTime(at)).toBe("05:10:30.123");
    expect(formatConsoleTime(0)).toBe("--:--:--.---");
  });

  it("exports plain text for copy", () => {
    const at = new Date(2026, 7, 2, 5, 10, 30, 0).getTime();
    const text = consoleLinesToText([{ level: "log", text: "hi", at }]);
    expect(text).toContain("[log] hi");
    expect(text).toContain("05:10:30.000");
  });
});
