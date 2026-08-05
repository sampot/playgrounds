/**
 * Bottom dock model (DEC-044): Console + opt-in builtins + plain SAM panels.
 */

export const MAX_BOTTOM_SAM = 3;

export const BOTTOM_BUILTINS = ["python", "javascript", "shell"] as const;
export type BottomBuiltinId = (typeof BOTTOM_BUILTINS)[number];

export type BottomSamPanel = {
  sandboxId: string;
  label?: string;
};

export type BottomTabId = "console" | BottomBuiltinId | `sam:${string}`;

export type BottomDockErrorCode =
  | "bottom_sam_limit"
  | "bottom_sam_conflict"
  | "bottom_panel_not_found"
  | "bad_sandbox";

export class BottomDockError extends Error {
  readonly code: BottomDockErrorCode;

  constructor(code: BottomDockErrorCode, message: string) {
    super(message);
    this.name = "BottomDockError";
    this.code = code;
  }
}

export function isBottomBuiltinId(id: string): id is BottomBuiltinId {
  return (BOTTOM_BUILTINS as readonly string[]).includes(id);
}

export function bottomSamTabId(sandboxId: string): `sam:${string}` {
  return `sam:${sandboxId.trim()}`;
}

export function sandboxIdFromBottomSamTab(
  tabId: BottomTabId
): string | null {
  if (!tabId.startsWith("sam:")) return null;
  const id = tabId.slice(4).trim();
  return id || null;
}

export function builtinLabel(id: BottomBuiltinId): string {
  switch (id) {
    case "python":
      return "Python";
    case "javascript":
      return "JavaScript";
    case "shell":
      return "Shell";
  }
}

export function createInitialBottomDock(): {
  enabledBuiltins: BottomBuiltinId[];
  samPanels: BottomSamPanel[];
  activeTabId: BottomTabId;
} {
  return {
    enabledBuiltins: [],
    samPanels: [],
    activeTabId: "console",
  };
}

export function hasBuiltin(
  enabled: readonly BottomBuiltinId[],
  id: BottomBuiltinId
): boolean {
  return enabled.includes(id);
}

export function addBuiltin(
  enabled: readonly BottomBuiltinId[],
  id: BottomBuiltinId
): BottomBuiltinId[] {
  if (enabled.includes(id)) return [...enabled];
  return [...enabled, id];
}

export function removeBuiltin(
  enabled: readonly BottomBuiltinId[],
  activeTabId: BottomTabId,
  id: BottomBuiltinId
): { enabledBuiltins: BottomBuiltinId[]; activeTabId: BottomTabId } {
  const enabledBuiltins = enabled.filter(x => x !== id);
  const nextActive: BottomTabId =
    activeTabId === id ? "console" : activeTabId;
  return { enabledBuiltins, activeTabId: nextActive };
}

export function findBottomSam(
  panels: readonly BottomSamPanel[],
  sandboxId: string
): BottomSamPanel | undefined {
  const id = sandboxId.trim();
  return panels.find(p => p.sandboxId === id);
}

export function addBottomSam(
  panels: readonly BottomSamPanel[],
  input: {
    sandboxId: string;
    label?: string;
    /** Sandbox ids already mounted in main content (conflict). */
    mainSandboxIds?: readonly string[];
    stewardSandboxId?: string | null;
    workSandboxId?: string | null;
  }
): { samPanels: BottomSamPanel[]; activeTabId: BottomTabId } {
  const sandboxId = String(input.sandboxId ?? "").trim();
  if (!sandboxId) {
    throw new BottomDockError("bad_sandbox", "sandboxId 不可為空");
  }
  if (input.stewardSandboxId && sandboxId === input.stewardSandboxId) {
    throw new BottomDockError("bad_sandbox", "不可將總管掛到下方面板");
  }
  if (input.workSandboxId && sandboxId === input.workSandboxId) {
    throw new BottomDockError(
      "bad_sandbox",
      "工作沙盒已有右側畫布，請用主內容掛載其他沙盒"
    );
  }
  if (input.mainSandboxIds?.includes(sandboxId)) {
    throw new BottomDockError(
      "bottom_sam_conflict",
      "此沙盒已掛在主內容，不可同時掛到下方"
    );
  }
  const existing = findBottomSam(panels, sandboxId);
  if (existing) {
    return {
      samPanels: [...panels],
      activeTabId: bottomSamTabId(sandboxId),
    };
  }
  if (panels.length >= MAX_BOTTOM_SAM) {
    throw new BottomDockError(
      "bottom_sam_limit",
      `下方輔助 SAM 最多 ${MAX_BOTTOM_SAM} 個`
    );
  }
  const panel: BottomSamPanel = {
    sandboxId,
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
  };
  return {
    samPanels: [...panels, panel],
    activeTabId: bottomSamTabId(sandboxId),
  };
}

export function removeBottomSam(
  panels: readonly BottomSamPanel[],
  activeTabId: BottomTabId,
  sandboxId: string
): { samPanels: BottomSamPanel[]; activeTabId: BottomTabId } {
  const id = sandboxId.trim();
  const samPanels = panels.filter(p => p.sandboxId !== id);
  if (samPanels.length === panels.length) {
    throw new BottomDockError("bottom_panel_not_found", "下方找不到該 SAM");
  }
  const tab = bottomSamTabId(id);
  const nextActive: BottomTabId =
    activeTabId === tab ? "console" : activeTabId;
  return { samPanels, activeTabId: nextActive };
}

export function clearBottomSams(activeTabId: BottomTabId): {
  samPanels: BottomSamPanel[];
  activeTabId: BottomTabId;
} {
  const nextActive: BottomTabId =
    sandboxIdFromBottomSamTab(activeTabId) != null ? "console" : activeTabId;
  return { samPanels: [], activeTabId: nextActive };
}

/** True if active tab is allowed given current dock membership. */
export function isBottomTabAllowed(
  tabId: BottomTabId,
  enabled: readonly BottomBuiltinId[],
  panels: readonly BottomSamPanel[]
): boolean {
  if (tabId === "console") return true;
  if (isBottomBuiltinId(tabId)) return enabled.includes(tabId);
  const sid = sandboxIdFromBottomSamTab(tabId);
  return sid != null && Boolean(findBottomSam(panels, sid));
}

export function clampBottomTab(
  tabId: BottomTabId,
  enabled: readonly BottomBuiltinId[],
  panels: readonly BottomSamPanel[]
): BottomTabId {
  return isBottomTabAllowed(tabId, enabled, panels) ? tabId : "console";
}

/**
 * Migrate layout: restore enabled builtins from explicit list, or from
 * legacy bottomTab (python／javascript／shell／terminal → python).
 * Does not imply Worker boot.
 */
export function migrateBottomDockFromLayout(parsed: {
  enabledBottomBuiltins?: unknown;
  bottomTab?: unknown;
}): {
  enabledBuiltins: BottomBuiltinId[];
  activeTabId: BottomTabId;
} {
  const enabled = new Set<BottomBuiltinId>();
  if (Array.isArray(parsed.enabledBottomBuiltins)) {
    for (const raw of parsed.enabledBottomBuiltins) {
      if (typeof raw === "string" && isBottomBuiltinId(raw)) {
        enabled.add(raw);
      }
    }
  }

  let active: BottomTabId = "console";
  const tab = parsed.bottomTab;
  if (tab === "console") {
    active = "console";
  } else if (tab === "terminal") {
    enabled.add("python");
    active = "python";
  } else if (typeof tab === "string" && isBottomBuiltinId(tab)) {
    enabled.add(tab);
    active = tab;
  } else if (tab === "agent") {
    active = "console";
  }

  const enabledBuiltins = BOTTOM_BUILTINS.filter(id => enabled.has(id));
  return {
    enabledBuiltins,
    activeTabId: clampBottomTab(active, enabledBuiltins, []),
  };
}
