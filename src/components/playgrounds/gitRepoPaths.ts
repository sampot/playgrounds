/** Shared path filters for public git-host project import (GitHub / GitLab). */

import { normalizeProjectPath } from "./pathUtils";
import { isBinaryPath, isMetaFilename } from "./projectTypes";

const TEXT_EXT =
  /\.(?:html?|css|js|mjs|cjs|ts|tsx|jsx|json|md|markdown|svg|txt|xml|csv|map|vue|svelte|ya?ml|toml|py|sql|sh|bash|zsh|env)$/iu;

const BINARY_EXT =
  /\.(?:png|jpe?g|gif|webp|ico|bmp|avif|woff2?|ttf|otf|eot|wasm|pdf|apk|so)$/iu;

const SKIP_DIR_PART =
  /(?:^|\/)(?:\.git|node_modules|\.svn|\.hg|dist|build|\.next|coverage)(?:\/|$)/u;

function basenameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function shouldIncludeRepoPath(
  path: string,
  rootPrefix: string
): boolean {
  if (SKIP_DIR_PART.test(path)) return false;
  if (rootPrefix) {
    if (path !== rootPrefix && !path.startsWith(`${rootPrefix}/`)) return false;
  }
  if (path.endsWith("/")) return false;
  // Host side-ledger only — never import as SAM files (DEC-024).
  if (isMetaFilename(basenameOf(path))) return false;
  if (!TEXT_EXT.test(path) && !BINARY_EXT.test(path) && !isBinaryPath(path)) {
    return false;
  }
  return true;
}

export function repoBlobToProjectPath(
  repoPath: string,
  rootPrefix: string
): string {
  if (!rootPrefix) return normalizeProjectPath(repoPath);
  if (repoPath === rootPrefix) {
    throw new Error("路徑指向目錄而非檔案集合");
  }
  return normalizeProjectPath(repoPath.slice(rootPrefix.length + 1));
}
