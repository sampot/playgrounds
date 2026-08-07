/** In-browser project model: UTF-8 text and binary file contents. */

import type { FileContent } from "./fileContent";
export type { FileContent, MediaPreviewKind } from "./fileContent";
export {
  bytesToFileContent,
  fileContentByteLength,
  fileContentToBytes,
  imageMimeType,
  isAudioPath,
  isBinaryContent,
  isBinaryPath,
  isEmptyTextContent,
  isImagePath,
  isMediaPreviewPath,
  isPdfPath,
  isTextContent,
  isVideoPath,
  mediaPreviewKind,
  mediaPreviewMimeType,
  writeShouldReloadCanvas,
} from "./fileContent";

export type FileMap = Record<string, FileContent>;

/**
 * Plain FileMap for Worker／MessagePort structured clone.
 * Strips reactive Proxies (e.g. Svelte `$state`) and copies binary views so
 * `postMessage` does not throw DataCloneError.
 */
export function cloneFileMapForTransfer(files: FileMap): FileMap {
  const out: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    if (typeof content === "string") {
      out[path] = content;
      continue;
    }
    if (content instanceof Uint8Array) {
      const copy = new Uint8Array(content.byteLength);
      copy.set(content);
      out[path] = copy;
    }
  }
  return out;
}

/**
 * Why a sandbox was cloned / steward-created (DEC-028).
 * Orthogonal to `agentManaged` and `inWorkingSet`.
 */
export type CloneIntent =
  | "user"
  | "steward_for_user"
  | "self_upgrade"
  | "session_seat"
  | "roster_avatar"
  | "experiment";

export interface ProjectMeta {
  id: string;
  name: string;
  entry: string;
  createdAt: string;
  updatedAt: string;
  /** Optional source note, e.g. GitHub URL used when cloning. */
  source?: string;
  /**
   * Projects created/cloned via `env.HOST` (agent lifecycle).
   * HOST.deleteProject may only remove these; user UI/import projects stay
   * protected (missing/false).
   */
  agentManaged?: boolean;
  /**
   * User working set (toolbar Picker visibility). Orthogonal to agentManaged.
   * Missing: migrate via `isInWorkingSet` (DEC-028).
   */
  inWorkingSet?: boolean;
  /** Direct clone source sandboxId; omit when not a clone. */
  clonedFrom?: string;
  /** Clone / steward-create intent for inventory partitioning and GC. */
  cloneIntent?: CloneIntent;
  /**
   * Tool discovery mirror (DEC-022／024): kinds from `index.html`
   * `sam:tool-kinds` (e.g. `["editor:text"]`). Not declared via side meta.
   */
  toolKinds?: string[];
  /**
   * Tool discovery mirror: globs from `sam:tool-globs` (e.g. `*.md`).
   */
  toolGlobs?: string[];
  /**
   * Admitted environment capabilities (DEC-036). Shell Config only —
   * not SAM declaration authority (`sam:capabilities` in index.html).
   * Default omitted on `.sam` export; import／clone re-admit.
   */
  admittedCapabilities?: string[];
  /**
   * Grants on this target sandbox for scoped HOST callers (DEC-051 §6.5).
   * Shell Config only; omitted on `.sam` export.
   */
  scopeGrants?: Array<{
    granteeSandboxId: string;
    paths: string[];
    mode: "read" | "readwrite";
    source: "explicit" | "auto";
  }>;
}

/** True when HOST.deleteProject is allowed for this project. */
export function isAgentManagedProject(
  meta: Pick<ProjectMeta, "agentManaged"> | null | undefined
): boolean {
  return meta?.agentManaged === true;
}

export const META_FILENAME = ".playgrounds-meta.json";
/** Pre-rename meta filename; still accepted when reading OPFS / project package. */
export const LEGACY_META_FILENAME = ".ide-meta.json";

export function isMetaFilename(name: string): boolean {
  return name === META_FILENAME || name === LEGACY_META_FILENAME;
}

/**
 * Strip `.playgrounds-meta.json` / legacy meta from an import FileMap.
 * Contents are ignored — host writes its own side ledger; SAM declarations
 * come from `index.html` head only (DEC-024).
 */
export function peelMetaFromFileMap(files: FileMap): {
  files: FileMap;
} {
  const out: FileMap = {};
  for (const [path, content] of Object.entries(files)) {
    if (isMetaFilename(path)) continue;
    out[path] = content;
  }
  return { files: out };
}

export const DEFAULT_ENTRY = "index.html";

/** Minimal scaffold: HTML + CSS + JS + shared README. */
export function createStarterFiles(): FileMap {
  return {
    "index.html": `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <title>Playground</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <h1>Playground</h1>
      <p>改檔即更新畫布。從這裡開始實驗。</p>
      <p>計數：<strong id="count">0</strong></p>
      <p><button type="button" id="inc">＋1</button></p>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`,
    "styles.css": `:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --panel: #fff;
  --text: #14161a;
  --muted: #5c6570;
  --line: #d8dde3;
  --accent: #0f766e;
  --on-accent: #f0fdfa;
  font-family: "IBM Plex Sans", system-ui, sans-serif;
  line-height: 1.5;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216;
    --panel: #171b21;
    --text: #e8ecf1;
    --muted: #9aa3ad;
    --line: #2a313a;
    --accent: #2dd4bf;
    --on-accent: #042f2e;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
}

main {
  max-width: 36rem;
  margin: 0 auto;
  padding: 2rem 1.25rem;
}

h1 {
  margin: 0 0 0.75rem;
  font-size: 1.5rem;
}

p {
  color: var(--muted);
}

#count {
  color: var(--text);
}

button {
  font: inherit;
  border: 1px solid transparent;
  background: var(--accent);
  color: var(--on-accent);
  border-radius: 0.5rem;
  padding: 0.45rem 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
`,
    "app.js": `const countEl = document.querySelector("#count");
const incBtn = document.querySelector("#inc");

let n = 0;
incBtn?.addEventListener("click", () => {
  n += 1;
  if (countEl) countEl.textContent = String(n);
});
`,
    "README.md": `# Playground

人與代理共用的沙盒說明（改這個檔，不要另建助理專用規格）。

## 入口

- 畫布入口：\`index.html\`（固定）
- 前端腳本：\`app.js\`、樣式：\`styles.css\`
- 可選：\`functions.js\`（Workers 形 \`/api/*\`）、\`controller.js\`（常駐 Controller）

## 建議目錄（沙盒變大時）

- \`ui/\` — 畫布前端
- \`lib/\` — 共用邏輯
- \`assets/\` — 圖片／字型／二進位（搜尋時可少碰）

主要語言是 **JavaScript**；數據分析可用遊樂場 Python。

## 怎麼驗證

改檔後看畫布；需要時開 Console。任務進度（給 Agent）寫在 \`.agent/plan.md\`／\`.agent/memory.md\`，不要把 scratch 寫進本 README。
`,
  };
}

export function defaultMeta(
  id: string,
  name: string,
  partial?: Partial<ProjectMeta>
): ProjectMeta {
  const now = new Date().toISOString();
  return {
    id,
    name,
    entry: DEFAULT_ENTRY,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Canvas entry is always project-root `index.html` (not user-selectable). */
export function pickEntry(_files?: FileMap, _preferred?: string): string {
  return DEFAULT_ENTRY;
}
