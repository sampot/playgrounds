/**
 * Pure helpers for Agent tool arg normalization / file windowing.
 * Kept out of the OPFS app.js string so unit tests can cover the contract;
 * the starter inlines equivalent logic for the canvas runtime.
 */

/** Accept common LLM slip: `pattern` instead of required `query`. */
export function normalizeSearchArgs(
  args: Record<string, unknown> | null | undefined
): {
  query?: string;
  glob?: string;
  maxResults?: number;
} {
  const a = args && typeof args === "object" ? args : {};
  const queryRaw = a.query ?? a.pattern;
  const query = typeof queryRaw === "string" ? queryRaw : undefined;
  const glob = typeof a.glob === "string" ? a.glob : undefined;
  const maxResults =
    typeof a.maxResults === "number" && Number.isFinite(a.maxResults)
      ? a.maxResults
      : undefined;
  return { query, glob, maxResults };
}

export interface FileWindow {
  content: string;
  /** 1-based start line of this window */
  offset: number;
  totalLines: number;
  totalChars: number;
  truncated: boolean;
  /** 1-based next start line, or null if complete */
  nextOffset: number | null;
}

/**
 * Line window for read_file. `offset` is 1-based start line (LLM-familiar);
 * `limit` is max lines in the window.
 */
export function sliceFileContent(
  content: string,
  options?: { offset?: unknown; limit?: unknown; defaultLimit?: number }
): FileWindow {
  const lines = content.split("\n");
  const totalLines = lines.length;
  const totalChars = content.length;
  const defaultLimit = options?.defaultLimit ?? 120;
  const offsetRaw = Number(options?.offset);
  // Accept 1-based line offset; treat 0/invalid as line 1.
  const startLine =
    Number.isFinite(offsetRaw) && offsetRaw >= 1 ? Math.floor(offsetRaw) : 1;
  const limitRaw = Number(options?.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.floor(limitRaw)
      : defaultLimit;
  if (startLine > totalLines) {
    return {
      content: "",
      offset: startLine,
      totalLines,
      totalChars,
      truncated: false,
      nextOffset: null,
    };
  }
  const startIdx = startLine - 1;
  const slicedLines = lines.slice(startIdx, startIdx + limit);
  const endLine = startIdx + slicedLines.length;
  const truncated = endLine < totalLines;
  return {
    content: slicedLines.join("\n"),
    offset: startLine,
    totalLines,
    totalChars,
    truncated,
    nextOffset: truncated ? endLine + 1 : null,
  };
}
