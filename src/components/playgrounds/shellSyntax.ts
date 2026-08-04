/**
 * Chain / redirect / pipeline syntax helpers for Playgrounds Shell.
 */

export const SHELL_MAX_CHAIN_STEPS = 16;
export const SHELL_MAX_PIPELINE_STAGES = 8;

export type ShellChainOp = "&&" | "||" | ";";

export type ShellRedirects = {
  /** Project-relative path for stdin (`<`). */
  stdinPath?: string;
  /** Project-relative path for stdout (`>` / `>>`). */
  stdoutPath?: string;
  stdoutAppend?: boolean;
};

/** Split on `&&` / `||` / `;` outside quotes. */
export function splitChainSegments(
  line: string
): { segments: string[]; ops: ShellChainOp[] } | { error: string } {
  const segments: string[] = [];
  const ops: ShellChainOp[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "&" && line[i + 1] === "&") {
      segments.push(cur.trim());
      ops.push("&&");
      cur = "";
      i++;
      continue;
    }
    if (ch === "|" && line[i + 1] === "|") {
      segments.push(cur.trim());
      ops.push("||");
      cur = "";
      i++;
      continue;
    }
    if (ch === ";") {
      segments.push(cur.trim());
      ops.push(";");
      cur = "";
      continue;
    }
    cur += ch;
  }
  segments.push(cur.trim());

  if (segments.some(s => !s)) {
    return { error: "命令鏈語法無效（空段落）" };
  }
  if (segments.length > SHELL_MAX_CHAIN_STEPS) {
    return {
      error: `命令鏈過長（最多 ${SHELL_MAX_CHAIN_STEPS} 段）`,
    };
  }
  return { segments, ops };
}

/**
 * Split on `|` outside quotes; does not treat `||` as a pipe.
 */
export function splitPipelineSegments(line: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "|") {
      if (line[i + 1] === "|") {
        cur += "||";
        i++;
        continue;
      }
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

export type ShellRedirectToken = {
  text: string;
  quoted: boolean;
};

type RedirectPath = { path: string; quoted: boolean };

/** Peel `<` / `>` / `>>` (token forms and glued `>file`), preserving quote flags. */
export function peelRedirectsDetailed(tokens: ShellRedirectToken[]):
  | {
      tokens: ShellRedirectToken[];
      redirects: ShellRedirects;
      redirectPaths: {
        stdin?: RedirectPath;
        stdout?: RedirectPath;
      };
    }
  | { error: string } {
  const out: ShellRedirectToken[] = [];
  const redirects: ShellRedirects = {};
  const redirectPaths: {
    stdin?: RedirectPath;
    stdout?: RedirectPath;
  } = {};

  const takePath = (
    raw: string,
    quoted: boolean
  ): RedirectPath | { error: string } => {
    const p = raw.trim();
    if (!p) return { error: "重導向缺少路徑" };
    return { path: p, quoted };
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;

    if (
      !tok.quoted &&
      (tok.text === ">" || tok.text === ">>" || tok.text === "<")
    ) {
      const next = tokens[i + 1];
      if (next == null) return { error: `重導向 ${tok.text} 缺少路徑` };
      const path = takePath(next.text, next.quoted);
      if ("error" in path) return path;
      i++;
      if (tok.text === "<") {
        if (redirects.stdinPath) return { error: "重複的 stdin 重導向" };
        redirects.stdinPath = path.path;
        redirectPaths.stdin = path;
      } else {
        if (redirects.stdoutPath) return { error: "重複的 stdout 重導向" };
        redirects.stdoutPath = path.path;
        redirects.stdoutAppend = tok.text === ">>";
        redirectPaths.stdout = path;
      }
      continue;
    }

    if (!tok.quoted && tok.text.startsWith(">>") && tok.text.length > 2) {
      const path = takePath(tok.text.slice(2), false);
      if ("error" in path) return path;
      if (redirects.stdoutPath) return { error: "重複的 stdout 重導向" };
      redirects.stdoutPath = path.path;
      redirects.stdoutAppend = true;
      redirectPaths.stdout = path;
      continue;
    }
    if (
      !tok.quoted &&
      tok.text.startsWith(">") &&
      tok.text.length > 1 &&
      !tok.text.startsWith(">>")
    ) {
      const path = takePath(tok.text.slice(1), false);
      if ("error" in path) return path;
      if (redirects.stdoutPath) return { error: "重複的 stdout 重導向" };
      redirects.stdoutPath = path.path;
      redirects.stdoutAppend = false;
      redirectPaths.stdout = path;
      continue;
    }
    if (!tok.quoted && tok.text.startsWith("<") && tok.text.length > 1) {
      const path = takePath(tok.text.slice(1), false);
      if ("error" in path) return path;
      if (redirects.stdinPath) return { error: "重複的 stdin 重導向" };
      redirects.stdinPath = path.path;
      redirectPaths.stdin = path;
      continue;
    }

    out.push(tok);
  }

  return { tokens: out, redirects, redirectPaths };
}

/** Peel `<` / `>` / `>>` from plain string tokens. */
export function peelRedirects(
  tokens: string[]
): { tokens: string[]; redirects: ShellRedirects } | { error: string } {
  const detailed = peelRedirectsDetailed(
    tokens.map(text => ({ text, quoted: false }))
  );
  if ("error" in detailed) return detailed;
  return {
    tokens: detailed.tokens.map(t => t.text),
    redirects: detailed.redirects,
  };
}

export function hasRedirects(r: ShellRedirects): boolean {
  return Boolean(r.stdinPath || r.stdoutPath);
}
