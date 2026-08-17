/**
 * `sam-manifest.json` contract (PG-GO-SAM-MANIFEST-PLAN / GAME-AGENT-GUIDE §2.5).
 * Pure parse／validate — no network.
 */

export const SAM_MANIFEST_FILENAME = "sam-manifest.json";
export const SAM_MANIFEST_CONTRACT_VERSION = 1;

export type SamManifestV1 = {
  version: 1;
  rev: string;
  files: string[];
};

export type SamManifest = SamManifestV1;

const ILLEGAL_PATH = /(?:^|\/)\.\.(?:\/|$)|^\/|(?:^|\/)\.(?:\/|$)/u;

export function isValidSamManifestPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (path !== path.trim()) return false;
  if (path.includes("\\")) return false;
  if (path.startsWith("/")) return false;
  if (ILLEGAL_PATH.test(path)) return false;
  if (path.split("/").some(p => !p || p === "." || p === "..")) return false;
  return true;
}

/**
 * Parse and validate a sam-manifest.json body.
 * Throws Error with a short Chinese message on failure.
 */
export function parseSamManifestJson(raw: string): SamManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("sam-manifest.json 不是有效 JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("sam-manifest.json 格式無效");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number" || !Number.isInteger(obj.version)) {
    throw new Error("sam-manifest.json 缺少有效的 version");
  }
  if (obj.version !== SAM_MANIFEST_CONTRACT_VERSION) {
    throw new Error(
      `不支援的 sam-manifest 契約版（${obj.version}；僅支援 ${SAM_MANIFEST_CONTRACT_VERSION}）`
    );
  }
  if (typeof obj.rev !== "string" || !obj.rev.trim()) {
    throw new Error("sam-manifest.json 缺少有效的 rev");
  }
  if (!Array.isArray(obj.files) || obj.files.length === 0) {
    throw new Error("sam-manifest.json 的 files 不可為空");
  }
  const files: string[] = [];
  const seen = new Set<string>();
  for (const item of obj.files) {
    if (typeof item !== "string" || !item) {
      throw new Error("sam-manifest.json 的 files 必須為字串路徑");
    }
    if (!isValidSamManifestPath(item)) {
      throw new Error(`sam-manifest.json 含非法路徑：${item}`);
    }
    if (seen.has(item)) {
      throw new Error(`sam-manifest.json 含重複路徑：${item}`);
    }
    seen.add(item);
    files.push(item);
  }
  if (!seen.has("index.html")) {
    throw new Error("sam-manifest.json 的 files 必須包含 index.html");
  }
  return {
    version: 1,
    rev: obj.rev.trim(),
    files,
  };
}
