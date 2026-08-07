/**
 * `.git/**` path helpers (PG-API-SCOPES-SPEC §8.4).
 * Default shell surfaces exclude git object DB unless explicitly opted in.
 */

const GIT_DIR_PART = /(?:^|\/)\.git(?:\/|$)/u;

/** True when path is `.git` or any `…/.git/…` segment. */
export function isGitPath(path: string): boolean {
  const n = String(path || "")
    .trim()
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "");
  return GIT_DIR_PART.test(n);
}

export function filterOutGitPaths<T extends string>(paths: readonly T[]): T[] {
  return paths.filter(p => !isGitPath(p));
}

/** Drop `.git/**` keys from a file map (shallow copy of remaining entries). */
export function omitGitFromFileMap<T>(
  files: Record<string, T>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [path, content] of Object.entries(files)) {
    if (isGitPath(path)) continue;
    out[path] = content;
  }
  return out;
}

export function omitGitFromDirList(dirs: readonly string[]): string[] {
  return dirs.filter(d => !isGitPath(d));
}
