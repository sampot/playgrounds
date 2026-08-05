import { describe, expect, it } from "vitest";
import {
  addBottomSam,
  addBuiltin,
  BottomDockError,
  bottomSamTabId,
  clearBottomSams,
  createInitialBottomDock,
  MAX_BOTTOM_SAM,
  migrateBottomDockFromLayout,
  removeBottomSam,
  removeBuiltin,
} from "./bottomDock";

describe("bottomDock", () => {
  it("starts with console only", () => {
    const s = createInitialBottomDock();
    expect(s.enabledBuiltins).toEqual([]);
    expect(s.samPanels).toEqual([]);
    expect(s.activeTabId).toBe("console");
  });

  it("adds and removes builtins", () => {
    let enabled = addBuiltin([], "python");
    expect(enabled).toEqual(["python"]);
    enabled = addBuiltin(enabled, "python");
    expect(enabled).toEqual(["python"]);
    const removed = removeBuiltin(enabled, "python", "python");
    expect(removed.enabledBuiltins).toEqual([]);
    expect(removed.activeTabId).toBe("console");
  });

  it("adds plain SAM and enforces limit", () => {
    let panels: ReturnType<typeof createInitialBottomDock>["samPanels"] = [];
    let active = "console" as const;
    for (let i = 0; i < MAX_BOTTOM_SAM; i++) {
      const next = addBottomSam(panels, { sandboxId: `s${i}`, label: `S${i}` });
      panels = next.samPanels;
      active = next.activeTabId as typeof active;
    }
    expect(panels).toHaveLength(MAX_BOTTOM_SAM);
    expect(active).toBe(bottomSamTabId(`s${MAX_BOTTOM_SAM - 1}`));
    expect(() => addBottomSam(panels, { sandboxId: "extra" })).toThrow(
      BottomDockError
    );
  });

  it("rejects steward, work, and main conflict", () => {
    expect(() =>
      addBottomSam([], {
        sandboxId: "steward",
        stewardSandboxId: "steward",
      })
    ).toThrow(/總管/);
    expect(() =>
      addBottomSam([], { sandboxId: "work", workSandboxId: "work" })
    ).toThrow(/工作沙盒/);
    expect(() =>
      addBottomSam([], {
        sandboxId: "b",
        mainSandboxIds: ["b"],
      })
    ).toThrow(/主內容/);
  });

  it("focuses existing SAM instead of duplicating", () => {
    const first = addBottomSam([], { sandboxId: "a", label: "A" });
    const second = addBottomSam(first.samPanels, { sandboxId: "a" });
    expect(second.samPanels).toHaveLength(1);
    expect(second.activeTabId).toBe(bottomSamTabId("a"));
  });

  it("clears SAMs and resets active when on a SAM tab", () => {
    const added = addBottomSam([], { sandboxId: "a" });
    const cleared = clearBottomSams(added.activeTabId);
    expect(cleared.samPanels).toEqual([]);
    expect(cleared.activeTabId).toBe("console");
  });

  it("removeBottomSam switches active to console", () => {
    const added = addBottomSam([], { sandboxId: "a" });
    const removed = removeBottomSam(
      added.samPanels,
      added.activeTabId,
      "a"
    );
    expect(removed.samPanels).toEqual([]);
    expect(removed.activeTabId).toBe("console");
  });

  it("migrates legacy bottomTab without explicit list", () => {
    const m = migrateBottomDockFromLayout({ bottomTab: "shell" });
    expect(m.enabledBuiltins).toEqual(["shell"]);
    expect(m.activeTabId).toBe("shell");
  });

  it("migrates terminal → python", () => {
    const m = migrateBottomDockFromLayout({ bottomTab: "terminal" });
    expect(m.enabledBuiltins).toEqual(["python"]);
    expect(m.activeTabId).toBe("python");
  });

  it("prefers explicit enabledBottomBuiltins", () => {
    const m = migrateBottomDockFromLayout({
      enabledBottomBuiltins: ["javascript", "python"],
      bottomTab: "console",
    });
    expect(m.enabledBuiltins).toEqual(["python", "javascript"]);
    expect(m.activeTabId).toBe("console");
  });
});
