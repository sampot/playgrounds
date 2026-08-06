/**
 * Playgrounds open-from-URL (DEC-025): parse `?open=` and fetch `.sam` packages.
 */

import {
  formatGithubSource,
  parseGithubUrl,
  type GithubRef,
} from "./githubProject";
import {
  formatGitlabSource,
  parseGitlabUrl,
  type GitlabRef,
} from "./gitlabProject";
import {
  MAX_TRANSFER_BYTES,
  filenameFromContentDisposition,
  filenameFromUrl,
} from "./workspaceTransfer";
import { buildCanonicalOpenUrl } from "./playgroundsPaths";
import { isSamFilename } from "./zipProject";
import {
  readResponseBytes,
  type ByteProgress,
} from "./transferProgress";

export type OpenRole = "work" | "tool" | "agent";

/** Presentation after open. `canvas` = maximize preview (試玩／分享). */
export type OpenView = "default" | "canvas";

export type OpenQueryOptions = {
  /** Post-import role. Default work. */
  as: OpenRole;
  /** Override project display name. */
  name?: string;
  /** ask = DEC-018 dialog when package has state; none = skip all state. */
  state: "ask" | "none";
  /** When true, always create a new project (skip same-source reuse). */
  fresh: boolean;
  /**
   * `canvas` → maximize canvas after open (catalog share / casual try).
   * Default = shell chrome for developers (一鍵開).
   */
  view: OpenView;
};

export const DEFAULT_OPEN_OPTIONS: OpenQueryOptions = {
  as: "work",
  state: "ask",
  fresh: false,
  view: "default",
};

export type OpenIntent =
  | {
      kind: "sam";
      url: string;
      displayUrl: string;
      options: OpenQueryOptions;
    }
  | {
      kind: "github";
      input: string;
      ref: GithubRef;
      options: OpenQueryOptions;
    }
  | {
      kind: "gitlab";
      input: string;
      ref: GitlabRef;
      options: OpenQueryOptions;
    }
  | { kind: "invalid"; reason: string; options: OpenQueryOptions };

const OPEN_PARAM = "open";
/** Cleared together with `open` after boot handling. */
const OPEN_RELATED_PARAMS = [
  "open",
  "as",
  "name",
  "state",
  "fresh",
  "view",
] as const;

/** True when a URL pathname (decoded) ends with `.sam`. */
export function pathnameLooksLikeSam(pathname: string): boolean {
  const last = pathname.split("/").filter(Boolean).pop() || "";
  try {
    return isSamFilename(decodeURIComponent(last));
  } catch {
    return isSamFilename(last);
  }
}

/**
 * Rewrite GitHub HTML blob/raw links to raw.githubusercontent.com so CORS fetch
 * can retrieve package bytes.
 */
export function resolveSamPackageUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return raw.trim();
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (/(?:^|\.)github\.com$/iu.test(url.hostname)) {
    // owner/repo/blob|raw/ref/path...
    if (parts.length >= 5 && (parts[2] === "blob" || parts[2] === "raw")) {
      const owner = parts[0]!;
      const repo = parts[1]!.replace(/\.git$/u, "");
      const ref = parts[3]!;
      const path = parts.slice(4).join("/");
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
    }
    // releases/download/tag/file.sam — keep as-is
    return url.href;
  }

  if (/(?:^|\.)gitlab\.com$/iu.test(url.hostname)) {
    const dash = parts.indexOf("-");
    if (
      dash >= 2 &&
      (parts[dash + 1] === "blob" || parts[dash + 1] === "raw") &&
      parts.length > dash + 3
    ) {
      const projectPath = parts.slice(0, dash).join("/");
      const ref = parts[dash + 2]!;
      const path = parts.slice(dash + 3).join("/");
      return `https://gitlab.com/${projectPath}/-/raw/${ref}/${path}`;
    }
  }

  return url.href;
}

export function parseOpenQueryOptions(
  params: URLSearchParams
): OpenQueryOptions {
  const asRaw = (params.get("as") || "work").trim().toLowerCase();
  const as: OpenRole = asRaw === "tool" || asRaw === "agent" ? asRaw : "work";
  const nameRaw = params.get("name")?.trim();
  const stateRaw = (params.get("state") || "ask").trim().toLowerCase();
  const state: "ask" | "none" = stateRaw === "none" ? "none" : "ask";
  const freshRaw = (params.get("fresh") || "").trim().toLowerCase();
  const fresh = freshRaw === "1" || freshRaw === "true" || freshRaw === "yes";
  const viewRaw = (params.get("view") || "").trim().toLowerCase();
  const view: OpenView =
    viewRaw === "canvas" ||
    viewRaw === "maximize_preview" ||
    viewRaw === "preview"
      ? "canvas"
      : "default";
  return {
    as,
    name: nameRaw || undefined,
    state,
    fresh,
    view,
  };
}

export function parseOpenIntent(
  search: string | URLSearchParams
): OpenIntent | null {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  if (!params.has(OPEN_PARAM)) return null;
  const options = parseOpenQueryOptions(params);
  const raw = params.get(OPEN_PARAM);
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { kind: "invalid", reason: "開啟來源為空（?open=）", options };
  }

  // Prefer `.sam` package when the path clearly names one (including GitHub blob).
  let asUrl: URL | null = null;
  try {
    asUrl = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    asUrl = null;
  }

  if (asUrl && (asUrl.protocol === "http:" || asUrl.protocol === "https:")) {
    if (pathnameLooksLikeSam(asUrl.pathname)) {
      const resolved = resolveSamPackageUrl(asUrl.href);
      return {
        kind: "sam",
        url: resolved,
        displayUrl: asUrl.href,
        options,
      };
    }
  }

  const gh = parseGithubUrl(trimmed);
  if (gh) {
    return { kind: "github", input: trimmed, ref: gh, options };
  }

  const gl = parseGitlabUrl(trimmed);
  if (gl) {
    return { kind: "gitlab", input: trimmed, ref: gl, options };
  }

  return {
    kind: "invalid",
    reason:
      "無法辨識開啟來源（需為 .sam 沙盒包裹網址，或 GitHub／GitLab 公開儲存庫／owner/repo）",
    options,
  };
}

/** Remove open-from-URL query keys from the current location without reloading. */
export function clearOpenQueryParam(
  loc: Pick<Location, "pathname" | "search" | "hash"> = window.location,
  historyApi: Pick<History, "replaceState"> = window.history
): void {
  const params = new URLSearchParams(
    loc.search.startsWith("?") ? loc.search.slice(1) : loc.search
  );
  if (!params.has(OPEN_PARAM)) return;
  for (const key of OPEN_RELATED_PARAMS) {
    params.delete(key);
  }
  const qs = params.toString();
  const next = `${loc.pathname}${qs ? `?${qs}` : ""}${loc.hash || ""}`;
  historyApi.replaceState(null, "", next);
}

/**
 * Deduplicate concurrent boot opens (Astro ClientRouter can remount while
 * `?open=` is still present if we defer clearing until after import).
 */
let sharedBootOpen: { search: string; promise: Promise<boolean> } | null = null;

export function normalizeOpenSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

export function beginSharedBootOpen(
  search: string,
  run: () => Promise<boolean>
): Promise<boolean> {
  const normalized = normalizeOpenSearch(search);
  if (!normalized || !normalized.includes(`${OPEN_PARAM}=`)) {
    return run();
  }
  if (sharedBootOpen && sharedBootOpen.search === normalized) {
    return sharedBootOpen.promise;
  }
  const promise = run().finally(() => {
    if (sharedBootOpen?.promise === promise) sharedBootOpen = null;
  });
  sharedBootOpen = { search: normalized, promise };
  return promise;
}

/** Test helper — reset module-level open coordination. */
export function resetSharedBootOpenForTests(): void {
  sharedBootOpen = null;
}

export interface FetchSamPackageResult {
  bytes: Uint8Array;
  filename: string;
  sourceUrl: string;
}

/**
 * Fetch a `.sam` package over the network. Requires CORS on the remote.
 */
export async function fetchSamPackageBytes(
  url: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: ByteProgress) => void;
  }
): Promise<FetchSamPackageResult> {
  const resolved = resolveSamPackageUrl(url.trim());
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error("URL 無效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("僅支援 http(s) URL");
  }

  let response: Response;
  try {
    response = await fetch(parsed.href, {
      signal: options?.signal,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (options?.signal?.aborted) throw new Error("已取消下載");
    throw new Error(
      `無法下載沙盒包裹（多半是對方未開放 CORS，或網路錯誤）：${msg}`
    );
  }

  if (!response.ok) {
    throw new Error(`下載沙盒包裹失敗：HTTP ${response.status}`);
  }

  const buf = await readResponseBytes(response, {
    signal: options?.signal,
    onProgress: options?.onProgress,
    maxBytes: MAX_TRANSFER_BYTES,
  });

  const inferred =
    filenameFromContentDisposition(
      response.headers.get("content-disposition")
    ) || filenameFromUrl(parsed.href);

  if (!isSamFilename(inferred) && !pathnameLooksLikeSam(parsed.pathname)) {
    throw new Error("遠端檔名不是 .sam 沙盒包裹");
  }

  return {
    bytes: buf,
    filename: isSamFilename(inferred) ? inferred : filenameFromUrl(parsed.href),
    sourceUrl: parsed.href,
  };
}

export function defaultNameFromOpenIntent(intent: OpenIntent): string | null {
  if (intent.kind === "sam") {
    const name = filenameFromUrl(intent.url).replace(/\.sam$/iu, "");
    return name || null;
  }
  if (intent.kind === "github") {
    const { ref } = intent;
    if (ref.path) {
      return ref.path.split("/").filter(Boolean).pop() || ref.repo;
    }
    return ref.repo;
  }
  if (intent.kind === "gitlab") {
    const { ref } = intent;
    if (ref.path) {
      return (
        ref.path.split("/").filter(Boolean).pop() ||
        ref.projectPath.split("/").pop() ||
        null
      );
    }
    return ref.projectPath.split("/").filter(Boolean).pop() || null;
  }
  return null;
}

export function sourceLabelFromOpenIntent(intent: OpenIntent): string | null {
  if (intent.kind === "sam") return intent.displayUrl;
  if (intent.kind === "github") return formatGithubSource(intent.ref);
  if (intent.kind === "gitlab") return formatGitlabSource(intent.ref);
  return null;
}

/**
 * Canonical key for same-source reuse (dedupe). Stable across equivalent URLs.
 */
export function openSourceKey(intent: OpenIntent): string | null {
  if (intent.kind === "sam") {
    return `sam:${resolveSamPackageUrl(intent.displayUrl).toLowerCase()}`;
  }
  if (intent.kind === "github") {
    const r = intent.ref;
    const ref = (r.ref || "HEAD").toLowerCase();
    const path = (r.path || "").toLowerCase();
    return `github:${r.owner.toLowerCase()}/${r.repo.toLowerCase()}@${ref}:${path}`;
  }
  if (intent.kind === "gitlab") {
    const r = intent.ref;
    const ref = (r.ref || "HEAD").toLowerCase();
    const path = (r.path || "").toLowerCase();
    return `gitlab:${r.projectPath.toLowerCase()}@${ref}:${path}`;
  }
  return null;
}

export function openSourceKeyFromMetaSource(
  source: string | null | undefined
): string | null {
  if (!source?.trim()) return null;
  const intent = parseOpenIntent(new URLSearchParams({ open: source.trim() }));
  if (!intent || intent.kind === "invalid") return null;
  return openSourceKey(intent);
}

export function findSandboxIdByOpenSource(
  projects: { id: string; source?: string }[],
  intent: OpenIntent
): string | null {
  const key = openSourceKey(intent);
  if (!key) return null;
  for (const p of projects) {
    const pk = openSourceKeyFromMetaSource(p.source);
    if (pk && pk === key) return p.id;
  }
  return null;
}

/** True when `source` can be placed in `?open=` (`.sam` URL or git host). */
export function canBuildOpenUrlFromSource(
  source: string | null | undefined
): boolean {
  if (!source?.trim()) return false;
  const intent = parseOpenIntent(new URLSearchParams({ open: source.trim() }));
  return Boolean(intent && intent.kind !== "invalid");
}

/**
 * Build a shareable Playgrounds deep link (DEC-041).
 * Default: canonical `https://play.samkuo.me/?open=…`.
 * Pass `origin` / `playgroundsPath` to override (same-origin copy / tests).
 */
export function buildPlaygroundsOpenUrl(
  source: string,
  options?: {
    origin?: string;
    playgroundsPath?: string;
    as?: OpenRole;
    state?: "ask" | "none";
    name?: string;
    fresh?: boolean;
    view?: OpenView;
  }
): string {
  const trimmed = source.trim();
  if (!trimmed) throw new Error("開啟來源為空");
  if (!canBuildOpenUrlFromSource(trimmed)) {
    throw new Error(
      "此來源無法產生開啟連結（需為 .sam 沙盒包裹網址，或 GitHub／GitLab 公開儲存庫）"
    );
  }
  return buildCanonicalOpenUrl(trimmed, options);
}

/** Append actionable hints for common open-from-URL failures. */
export function explainOpenFromUrlError(
  error: unknown,
  kind: "sam" | "github" | "gitlab" | "unknown" = "unknown"
): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (
    kind === "sam" ||
    msg.includes("未開放 CORS") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("cors")
  ) {
    if (
      msg.includes("未開放 CORS") ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("cors")
    ) {
      return `${msg} 提示：.sam 主機需允許跨站下載（CORS）；可改放 GitHub／GitLab raw，或下載後用「匯入沙盒」。`;
    }
  }

  if (
    kind === "github" ||
    kind === "gitlab" ||
    /rate limit/i.test(msg) ||
    /API rate/i.test(msg)
  ) {
    if (/403/.test(msg) || /rate limit/i.test(msg) || /API rate/i.test(msg)) {
      return `${msg} 提示：Git API 有頻率限制；稍後再試，或改用 .sam 直連。`;
    }
  }

  if (/HTTP 404/.test(msg)) {
    return `${msg} 提示：確認來源是否公開、路徑是否正確。`;
  }

  if ((kind === "github" || kind === "gitlab") && /HTTP 40\d/.test(msg)) {
    return `${msg} 提示：僅支援公開儲存庫；私有 repo 無法一鍵開啟。`;
  }

  return msg;
}
