/** Path helpers for in-browser web projects. */

export function normalizeProjectPath(path: string): string {
  const trimmed = path.trim().replace(/\\/gu, "/").replace(/\/+$/u, "");
  const noLead = trimmed.replace(/^(\.\/)+/u, "").replace(/^\/+/u, "");
  const parts: string[] = [];
  for (const part of noLead.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) {
        throw new Error("路徑不可超出沙盒根目錄");
      }
      parts.pop();
      continue;
    }
    if (part.includes("\0")) {
      throw new Error("路徑含非法字元");
    }
    parts.push(part);
  }
  return parts.join("/");
}

export function isValidProjectPath(path: string): boolean {
  try {
    const n = normalizeProjectPath(path);
    return n.length > 0;
  } catch {
    return false;
  }
}

/** Directory paths use the same normalization (no trailing slash). */
export function isValidDirPath(path: string): boolean {
  return isValidProjectPath(path);
}

export function parentDir(path: string): string {
  const n = normalizeProjectPath(path);
  const i = n.lastIndexOf("/");
  return i === -1 ? "" : n.slice(0, i);
}

export function basename(path: string): string {
  const n = normalizeProjectPath(path);
  const i = n.lastIndexOf("/");
  return i === -1 ? n : n.slice(i + 1);
}

export function joinProjectPath(...parts: string[]): string {
  return normalizeProjectPath(parts.filter(Boolean).join("/"));
}

/** Sort paths: directories (by prefix) naturally via localeCompare on full path. */
export function sortProjectPaths(paths: string[]): string[] {
  return [...paths].sort((a, b) => a.localeCompare(b, "en"));
}

/** True when `path` is `dir` or lives under `dir/`. */
export function isUnderDir(path: string, dir: string): boolean {
  const p = normalizeProjectPath(path);
  if (!dir) return true;
  const d = normalizeProjectPath(dir);
  return p === d || p.startsWith(`${d}/`);
}

/** Files whose path is strictly inside `dir` (not the dir path itself). */
export function filesUnderDir(filePaths: string[], dir: string): string[] {
  if (!dir) return [...filePaths];
  const prefix = `${normalizeProjectPath(dir)}/`;
  return filePaths.filter(p => {
    try {
      return normalizeProjectPath(p).startsWith(prefix);
    } catch {
      return false;
    }
  });
}

/** Rewrite `from` → `to` for a path equal to or under `from`. */
export function rewritePathPrefix(
  path: string,
  from: string,
  to: string
): string {
  const p = normalizeProjectPath(path);
  const f = normalizeProjectPath(from);
  const t = normalizeProjectPath(to);
  if (p === f) return t;
  if (p.startsWith(`${f}/`)) return `${t}${p.slice(f.length)}`;
  return p;
}

export type FileTreeNode =
  | { kind: "dir"; name: string; path: string; children: FileTreeNode[] }
  | { kind: "file"; name: string; path: string };

type MutableDir = {
  kind: "dir";
  name: string;
  path: string;
  children: Map<string, MutableDir | FileTreeNode>;
};

/**
 * Build a sorted tree from file paths plus optional empty (or known) directories.
 * Directories sort before files; names use localeCompare("en").
 */
export function buildFileTree(
  filePaths: string[],
  extraDirs: string[] = []
): FileTreeNode[] {
  const root: MutableDir = {
    kind: "dir",
    name: "",
    path: "",
    children: new Map(),
  };

  function ensureDirNode(dirPath: string): MutableDir {
    if (!dirPath) return root;
    const parts = dirPath.split("/");
    let cur = root;
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      let next = cur.children.get(part);
      if (!next || next.kind !== "dir") {
        next = {
          kind: "dir",
          name: part,
          path: acc,
          children: new Map(),
        };
        cur.children.set(part, next);
      }
      cur = next as MutableDir;
    }
    return cur;
  }

  for (const raw of extraDirs) {
    try {
      const d = normalizeProjectPath(raw);
      if (d) ensureDirNode(d);
    } catch {
      /* skip invalid */
    }
  }

  for (const raw of filePaths) {
    let path: string;
    try {
      path = normalizeProjectPath(raw);
    } catch {
      continue;
    }
    if (!path) continue;
    const parent = parentDir(path);
    const name = basename(path);
    const dir = ensureDirNode(parent);
    dir.children.set(name, { kind: "file", name, path });
  }

  function finalize(node: MutableDir): FileTreeNode[] {
    const dirs: FileTreeNode[] = [];
    const files: FileTreeNode[] = [];
    for (const child of node.children.values()) {
      if (child.kind === "dir") {
        const dirNode = child as MutableDir;
        dirs.push({
          kind: "dir",
          name: dirNode.name,
          path: dirNode.path,
          children: finalize(dirNode),
        });
      } else {
        files.push(child);
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name, "en"));
    files.sort((a, b) => a.name.localeCompare(b.name, "en"));
    return [...dirs, ...files];
  }

  return finalize(root);
}

export function guessLanguage(path: string): string {
  const name = basename(path).toLowerCase();
  if (name.endsWith(".html") || name.endsWith(".htm")) return "html";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".js") || name.endsWith(".mjs") || name.endsWith(".cjs"))
    return "javascript";
  if (name.endsWith(".ts") || name.endsWith(".mts") || name.endsWith(".cts"))
    return "typescript";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".svg")) return "xml";
  return "plaintext";
}
