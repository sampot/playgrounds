import { fetchGithubProject, parseGithubUrl } from "@pg/githubProject";
import type { FileMap } from "@pg/projectTypes";

/** Fetch SAM FileMap from a catalog／compose `source` (GitHub owner/repo or URL). */
export async function loadSamFiles(source: string): Promise<FileMap> {
  const ref = parseGithubUrl(source);
  if (!ref) {
    throw new Error(`無法解析小品來源：${source}`);
  }
  return fetchGithubProject(ref);
}

export function assertSamHasIndex(files: FileMap): void {
  if (files["index.html"] || files["/index.html"]) return;
  const hasIndex = Object.keys(files).some(
    p => p === "index.html" || p.endsWith("/index.html")
  );
  if (!hasIndex) {
    throw new Error("小品缺少 index.html");
  }
}
