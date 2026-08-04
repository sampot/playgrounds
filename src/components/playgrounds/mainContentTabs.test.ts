import { describe, expect, it } from "vitest";
import {
  clearCanvasTabs,
  closeMainTab,
  createInitialMainTabs,
  EDITOR_TAB_ID,
  findGrantCanvasTab,
  getForegroundToolSession,
  listCanvasTabs,
  MainTabsError,
  MAX_CANVAS_TABS,
  openCanvasTab,
  setActiveMainTab,
} from "./mainContentTabs";

describe("mainContentTabs", () => {
  it("starts with editor only", () => {
    const s = createInitialMainTabs();
    expect(s.tabs).toHaveLength(1);
    expect(s.activeTabId).toBe(EDITOR_TAB_ID);
    expect(listCanvasTabs(s.tabs)).toHaveLength(0);
  });

  it("opens plain canvas and focuses it", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "b",
      label: "Beta",
    });
    expect(listCanvasTabs(s.tabs)).toHaveLength(1);
    expect(s.activeTabId).toBe("canvas:b");
    expect(getForegroundToolSession(s.tabs, s.activeTabId)).toBeNull();
  });

  it("reopens same project focuses existing tab", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "b" });
    s = {
      tabs: s.tabs,
      activeTabId: setActiveMainTab(s.tabs, EDITOR_TAB_ID),
    };
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "b" });
    expect(listCanvasTabs(s.tabs)).toHaveLength(1);
    expect(s.activeTabId).toBe("canvas:b");
  });

  it("enforces canvas tab limit", () => {
    let s = createInitialMainTabs();
    for (let i = 0; i < MAX_CANVAS_TABS; i++) {
      s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: `p${i}` });
    }
    expect(() =>
      openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "extra" })
    ).toThrow(MainTabsError);
    try {
      openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "extra" });
    } catch (e) {
      expect((e as MainTabsError).code).toBe("main_tabs_limit");
    }
  });

  it("cannot close editor tab", () => {
    const s = createInitialMainTabs();
    expect(() => closeMainTab(s.tabs, s.activeTabId, EDITOR_TAB_ID)).toThrow(
      MainTabsError
    );
  });

  it("close active canvas returns to editor when alone", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "b" });
    s = closeMainTab(s.tabs, s.activeTabId);
    expect(s.activeTabId).toBe(EDITOR_TAB_ID);
    expect(listCanvasTabs(s.tabs)).toHaveLength(0);
  });

  it("close active canvas prefers neighbor", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "a" });
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "b" });
    s = closeMainTab(s.tabs, s.activeTabId, "canvas:b");
    expect(s.activeTabId).toBe("canvas:a");
  });

  it("open with grant sets foreground tool session", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "tool",
      grant: {
        hostSandboxId: "work",
        paths: ["notes.md"],
        mode: "readwrite",
      },
      focusPath: "notes.md",
    });
    const sess = getForegroundToolSession(s.tabs, s.activeTabId);
    expect(sess?.toolSandboxId).toBe("tool");
    expect(sess?.grant.paths).toEqual(["notes.md"]);
    expect(findGrantCanvasTab(s.tabs)?.sandboxId).toBe("tool");
  });

  it("allows .bindings/db as grant focusPath (DEC-037)", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "dbtool",
      grant: {
        hostSandboxId: "work",
        paths: [".bindings/db"],
        mode: "readwrite",
      },
      focusPath: ".bindings/db",
    });
    const sess = getForegroundToolSession(s.tabs, s.activeTabId);
    expect(sess?.grant.paths).toEqual([".bindings/db"]);
    expect(sess?.focusPath).toBe(".bindings/db");
  });

  it("canonicalizes legacy .bindings/d1 to .bindings/db", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "dbtool",
      grant: {
        hostSandboxId: "work",
        paths: [".bindings/d1"],
        mode: "readwrite",
      },
      focusPath: ".bindings/d1",
    });
    const sess = getForegroundToolSession(s.tabs, s.activeTabId);
    expect(sess?.grant.paths).toEqual([".bindings/db"]);
    expect(sess?.focusPath).toBe(".bindings/db");
  });

  it("exclusive grant strips previous grant tab", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "t1",
      grant: { hostSandboxId: "work", paths: ["a.md"], mode: "read" },
    });
    s = openCanvasTab(s.tabs, s.activeTabId, {
      sandboxId: "t2",
      grant: { hostSandboxId: "work", paths: ["b.md"], mode: "read" },
    });
    expect(findGrantCanvasTab(s.tabs)?.sandboxId).toBe("t2");
    const t1 = listCanvasTabs(s.tabs).find(t => t.sandboxId === "t1");
    expect(t1?.grant).toBeUndefined();
  });

  it("clearCanvasTabs keeps editor", () => {
    let s = createInitialMainTabs();
    s = openCanvasTab(s.tabs, s.activeTabId, { sandboxId: "b" });
    s = clearCanvasTabs(s.tabs);
    expect(s.tabs).toEqual([{ id: EDITOR_TAB_ID, kind: "editor" }]);
    expect(s.activeTabId).toBe(EDITOR_TAB_ID);
  });

  it("setActiveMainTab rejects unknown", () => {
    const s = createInitialMainTabs();
    expect(() => setActiveMainTab(s.tabs, "nope")).toThrow(MainTabsError);
  });
});
