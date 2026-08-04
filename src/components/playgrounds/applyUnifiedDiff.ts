/**
 * Minimal unified-diff apply for coding-orchestration host_apply (DEC-033).
 * Supports a single @@ hunk body (space/+/− lines) after ---/+++ headers.
 */

export class UnifiedDiffError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UnifiedDiffError";
    this.code = code;
  }
}

/** Apply a simple unified diff to `before`. Throws UnifiedDiffError on mismatch. */
export function applyUnifiedDiff(before: string, unifiedDiff: string): string {
  const diffLines = unifiedDiff.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < diffLines.length && !diffLines[i]!.startsWith("@@")) i += 1;
  if (i >= diffLines.length) {
    throw new UnifiedDiffError("act_rejected", "diff 缺少 @@ hunk");
  }
  i += 1; // skip @@ header

  const oldLines = before.split("\n");
  // If file ends with newline, split keeps trailing ""; keep that shape.
  const out: string[] = [];
  let oi = 0;

  while (i < diffLines.length) {
    const line = diffLines[i]!;
    if (
      line.startsWith("@@") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      break;
    }
    if (line.startsWith("\\")) {
      i += 1;
      continue;
    }
    const tag = line[0];
    const text = line.slice(1);
    if (tag === " ") {
      if (oi >= oldLines.length || oldLines[oi] !== text) {
        throw new UnifiedDiffError(
          "act_rejected",
          `diff context 不符（約第 ${oi + 1} 行）`
        );
      }
      out.push(oldLines[oi]!);
      oi += 1;
    } else if (tag === "-") {
      if (oi >= oldLines.length || oldLines[oi] !== text) {
        throw new UnifiedDiffError(
          "act_rejected",
          `diff 刪除行不符（約第 ${oi + 1} 行）`
        );
      }
      oi += 1;
    } else if (tag === "+") {
      out.push(text);
    } else if (line === "") {
      // tolerate blank separator
    } else {
      throw new UnifiedDiffError(
        "act_rejected",
        `無法解析 diff 行：${line.slice(0, 40)}`
      );
    }
    i += 1;
  }

  while (oi < oldLines.length) {
    out.push(oldLines[oi]!);
    oi += 1;
  }
  return out.join("\n");
}
