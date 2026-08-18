import { describe, expect, it } from "vitest";
import {
  GO_HELP_DESK_LINES,
  helpDeskIsLast,
  helpDeskLineAt,
  nextHelpDeskIndex,
} from "./goHelpDesk";

describe("goHelpDesk", () => {
  it("has ordered lines spoken at the desk", () => {
    expect(GO_HELP_DESK_LINES.length).toBeGreaterThan(3);
    expect(GO_HELP_DESK_LINES[0]?.speaker).toBe("詢問處");
    expect(GO_HELP_DESK_LINES[0]?.text.length).toBeGreaterThan(0);
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
