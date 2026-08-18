import { describe, expect, it } from "vitest";
import {
  GO_HELP_DESK_LINES,
  helpDeskIsLast,
  helpDeskLineAt,
  nextHelpDeskIndex,
} from "./goHelpDesk";

describe("goHelpDesk", () => {
  it("has ordered lines spoken by the boss", () => {
    expect(GO_HELP_DESK_LINES.length).toBeGreaterThan(3);
    expect(GO_HELP_DESK_LINES[0]?.speaker).toBe("老闆");
    expect(GO_HELP_DESK_LINES[0]?.text).toMatch(/找我/);
    expect(GO_HELP_DESK_LINES.some((line) => line.text.includes("詢問處"))).toBe(
      false
    );
  });

  it("advances one line at a time", () => {
    expect(helpDeskLineAt(0)?.text).toBe(GO_HELP_DESK_LINES[0]!.text);
    expect(nextHelpDeskIndex(0)).toBe(1);
    expect(helpDeskIsLast(0)).toBe(false);
  });

  it("stays on the last line until closed", () => {
    const last = GO_HELP_DESK_LINES.length - 1;
    expect(helpDeskIsLast(last)).toBe(true);
    expect(nextHelpDeskIndex(last)).toBe(last);
    expect(helpDeskLineAt(-1)).toBe(GO_HELP_DESK_LINES[0]);
    expect(helpDeskLineAt(99)).toBe(GO_HELP_DESK_LINES[last]);
  });
});
