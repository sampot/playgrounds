/**
 * Main content tab model (DEC-030): editor + up to 4 canvas SAM tabs.
 */

import type { ToolGrant, ToolGrantMode } from "./toolGrant";
import {
  assertFocusPathAllowed,
  normalizeGrant,
  ToolGrantError,
} from "./toolGrant";

export const EDITOR_TAB_ID = "editor";
export const MAX_CANVAS_TABS = 4;

export type MainTabId = string;

export type EditorMainTab = { id: typeof EDITOR_TAB_ID; kind: "editor" };

export type CanvasMainTab = {
  id: MainTabId;
  kind: "canvas";
  sandboxId: string;
  grant?: ToolGrant;
  focusPath?: string;
  label?: string;
};

export type MainTab = EditorMainTab | CanvasMainTab;

export type MainTabSummary = {
  tabId: string;
  kind: "editor" | "canvas";
  sandboxId?: string;
  hasGrant: boolean;
  focusPath?: string;
  label: string;
};

export type MainTabsErrorCode =
  "main_tabs_limit" | "main_tab_not_found" | "main_tab_immutable" | "bad_grant";

export class MainTabsError extends Error {
  readonly code: MainTabsErrorCode;

  constructor(code: MainTabsErrorCode, message: string) {
    super(message);
    this.name = "MainTabsError";
    this.code = code;
  }
}

export const EDITOR_TAB: EditorMainTab = {
  id: EDITOR_TAB_ID,
  kind: "editor",
};

export function createInitialMainTabs(): {
  tabs: MainTab[];
  activeTabId: MainTabId;
} {
  return { tabs: [EDITOR_TAB], activeTabId: EDITOR_TAB_ID };
}

export function listCanvasTabs(tabs: MainTab[]): CanvasMainTab[] {
  return tabs.filter((t): t is CanvasMainTab => t.kind === "canvas");
}

export function findTab(tabs: MainTab[], tabId: string): MainTab | undefined {
  return tabs.find(t => t.id === tabId);
}

export function findCanvasBySandboxId(
  tabs: MainTab[],
  sandboxId: string
): CanvasMainTab | undefined {
  const id = sandboxId.trim();
  return listCanvasTabs(tabs).find(t => t.sandboxId === id);
}

export function getActiveTab(tabs: MainTab[], activeTabId: MainTabId): MainTab {
  return findTab(tabs, activeTabId) ?? EDITOR_TAB;
}

/** Foreground tool session shape when active canvas tab has a grant. */
export function getForegroundToolSession(
  tabs: MainTab[],
  activeTabId: MainTabId
): {
  toolSandboxId: string;
  grant: ToolGrant;
  focusPath?: string;
} | null {
  const tab = getActiveTab(tabs, activeTabId);
  if (tab.kind !== "canvas" || !tab.grant) return null;
  return {
    toolSandboxId: tab.sandboxId,
    grant: tab.grant,
    ...(tab.focusPath ? { focusPath: tab.focusPath } : {}),
  };
}

/** Any tab with grant (MVP: at most one). Used by getToolSession when not requiring foreground. */
export function findGrantCanvasTab(tabs: MainTab[]): CanvasMainTab | undefined {
  return listCanvasTabs(tabs).find(t => t.grant);
}

export function toTabSummary(
  tab: MainTab,
  labelFallback?: string
): MainTabSummary {
  if (tab.kind === "editor") {
    return {
      tabId: tab.id,
      kind: "editor",
      hasGrant: false,
      label: "編輯器",
    };
  }
  return {
    tabId: tab.id,
    kind: "canvas",
    sandboxId: tab.sandboxId,
    hasGrant: Boolean(tab.grant),
    ...(tab.focusPath ? { focusPath: tab.focusPath } : {}),
    label: tab.label?.trim() || labelFallback || tab.sandboxId,
  };
}

function newCanvasTabId(sandboxId: string): string {
  return `canvas:${sandboxId}`;
}

export type OpenCanvasTabInput = {
  sandboxId: string;
  label?: string;
  grant?: {
    hostSandboxId: string;
    paths: string[];
    mode: ToolGrantMode | string;
  };
  focusPath?: string | null;
  /** When true (default), strip grant from any other canvas tab (MVP single grant). */
  exclusiveGrant?: boolean;
};

/**
 * Open or focus a canvas tab. Does not mutate; returns next state.
 */
export function openCanvasTab(
  tabs: MainTab[],
  _activeTabId: MainTabId,
  input: OpenCanvasTabInput
): { tabs: MainTab[]; activeTabId: MainTabId } {
  const sandboxId = String(input.sandboxId ?? "").trim();
  if (!sandboxId) {
    throw new MainTabsError("bad_grant", "sandboxId 不可為空");
  }

  let grant: ToolGrant | undefined;
  let focusPath: string | undefined;
  if (input.grant) {
    try {
      grant = normalizeGrant(input.grant);
      if (sandboxId === grant.hostSandboxId) {
        throw new MainTabsError("bad_grant", "畫布沙盒不可與工作沙盒相同");
      }
      if (input.focusPath != null && String(input.focusPath).trim()) {
        // OPFS path or virtual `.bindings/db`｜`kv` (DEC-037); not assertPathAllowed.
        focusPath = assertFocusPathAllowed(grant, String(input.focusPath));
      }
    } catch (e) {
      if (e instanceof MainTabsError) throw e;
      if (e instanceof ToolGrantError) {
        throw new MainTabsError(
          e.code === "bad_path" ? "bad_grant" : "bad_grant",
          e.message
        );
      }
      throw e;
    }
  }

  const existing = findCanvasBySandboxId(tabs, sandboxId);
  let nextTabs = [...tabs];
  const exclusiveGrant = input.exclusiveGrant !== false;

  if (grant && exclusiveGrant) {
    nextTabs = nextTabs.map(t => {
      if (t.kind === "canvas" && t.grant && t.sandboxId !== sandboxId) {
        return {
          id: t.id,
          kind: "canvas" as const,
          sandboxId: t.sandboxId,
          ...(t.label ? { label: t.label } : {}),
        };
      }
      return t;
    });
  }

  if (existing) {
    nextTabs = nextTabs.map(t => {
      if (t.id !== existing.id || t.kind !== "canvas") return t;
      const updated: CanvasMainTab = {
        ...t,
        ...(input.label != null ? { label: input.label } : {}),
      };
      if (grant) {
        updated.grant = grant;
        if (focusPath) updated.focusPath = focusPath;
        else delete updated.focusPath;
      }
      return updated;
    });
    return { tabs: nextTabs, activeTabId: existing.id };
  }

  if (listCanvasTabs(nextTabs).length >= MAX_CANVAS_TABS) {
    throw new MainTabsError(
      "main_tabs_limit",
      `主內容區最多 ${MAX_CANVAS_TABS} 個沙盒畫布`
    );
  }

  const tab: CanvasMainTab = {
    id: newCanvasTabId(sandboxId),
    kind: "canvas",
    sandboxId,
    ...(input.label ? { label: input.label } : {}),
    ...(grant ? { grant } : {}),
    ...(focusPath ? { focusPath } : {}),
  };
  nextTabs = [...nextTabs, tab];
  return { tabs: nextTabs, activeTabId: tab.id };
}

export function setActiveMainTab(tabs: MainTab[], tabId: string): MainTabId {
  const tab = findTab(tabs, tabId);
  if (!tab) {
    throw new MainTabsError("main_tab_not_found", `找不到 tab：${tabId}`);
  }
  return tab.id;
}

/**
 * Close a canvas tab. Cannot close editor.
 * If closing the active tab, activate `editor` (or neighbor canvas if preferred — plan: editor or adjacent).
 */
export function closeMainTab(
  tabs: MainTab[],
  activeTabId: MainTabId,
  tabId?: string
): { tabs: MainTab[]; activeTabId: MainTabId } {
  const targetId = (tabId ?? activeTabId).trim();
  if (targetId === EDITOR_TAB_ID) {
    throw new MainTabsError("main_tab_immutable", "不可關閉編輯器 tab");
  }
  const target = findTab(tabs, targetId);
  if (!target || target.kind !== "canvas") {
    throw new MainTabsError(
      "main_tab_not_found",
      `找不到可關閉的 tab：${targetId}`
    );
  }

  const canvas = listCanvasTabs(tabs);
  const idx = canvas.findIndex(t => t.id === targetId);
  const nextTabs = tabs.filter(t => t.id !== targetId);

  if (activeTabId !== targetId) {
    return { tabs: nextTabs, activeTabId };
  }

  // Prefer adjacent canvas, else editor
  const neighbor = canvas[idx + 1] ?? canvas[idx - 1] ?? null;
  if (neighbor && neighbor.id !== targetId) {
    const still = nextTabs.find(t => t.id === neighbor.id);
    if (still) return { tabs: nextTabs, activeTabId: still.id };
  }
  return { tabs: nextTabs, activeTabId: EDITOR_TAB_ID };
}

/** Drop all canvas tabs (e.g. work project switch). */
export function clearCanvasTabs(tabs: MainTab[]): {
  tabs: MainTab[];
  activeTabId: MainTabId;
} {
  return {
    tabs: tabs.filter(t => t.kind === "editor"),
    activeTabId: EDITOR_TAB_ID,
  };
}

export function listMainTabSummaries(
  tabs: MainTab[],
  labelForProject?: (sandboxId: string) => string | undefined
): MainTabSummary[] {
  return tabs.map(t =>
    toTabSummary(
      t,
      t.kind === "canvas" ? labelForProject?.(t.sandboxId) : undefined
    )
  );
}
