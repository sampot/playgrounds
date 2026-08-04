/**
 * LLM context hygiene for the Playgrounds agent starter (no embedding RAG).
 * Canonical logic; mirrored inside sampot/pg-steward `app.js` (canvas SPA cannot import).
 *
 * Strategy: char budget + stub old tool results + fold old turns into a digest,
 * plus durable working memory paths (.agent/plan.md / .agent/memory.md).
 */

import { extractResultPaths, extractToolPath } from "./agentUx";

export type LlmMessage = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

export type CompactOptions = {
  /** Soft cap on serialized message chars sent to the model. */
  maxChars?: number;
  /** Keep this many most-recent user turns verbatim (plus everything after). */
  keepRecentUserTurns?: number;
  /** Keep this many most-recent tool results verbatim; older ones become stubs. */
  keepRecentToolResults?: number;
  /** Hard cap per tool/assistant string body. */
  toolResultMaxChars?: number;
  /** Max chars kept inside a stubbed tool payload hint. */
  toolStubHintChars?: number;
};

export type CompactResult = {
  messages: LlmMessage[];
  charsBefore: number;
  charsAfter: number;
  stubbedToolCount: number;
  droppedPrefixCount: number;
  compacted: boolean;
};

export type OpeningNote = {
  path: string;
  content: string;
  truncated: boolean;
};

export const AGENT_CONTEXT_DEFAULTS = {
  maxChars: 100_000,
  keepRecentUserTurns: 3,
  keepRecentToolResults: 8,
  toolResultMaxChars: 4_000,
  toolStubHintChars: 160,
  openingNoteMaxChars: 1_800,
  openingFileListMax: 40,
} as const;

export const WORKING_MEMORY_PATHS = [
  ".agent/plan.md",
  ".agent/memory.md",
] as const;

export const OPENING_DOC_PATHS = [
  ".agent/plan.md",
  ".agent/memory.md",
  "README.md",
] as const;

export function messageChars(message: LlmMessage): number {
  let n = (message.role || "").length + 8;
  if (typeof message.content === "string") n += message.content.length;
  else if (message.content != null) {
    try {
      n += JSON.stringify(message.content).length;
    } catch {
      n += String(message.content).length;
    }
  }
  if (message.tool_calls != null) {
    try {
      n += JSON.stringify(message.tool_calls).length;
    } catch {
      n += 64;
    }
  }
  if (typeof message.tool_call_id === "string")
    n += message.tool_call_id.length;
  if (typeof message.name === "string") n += message.name.length;
  return n;
}

export function messagesChars(messages: LlmMessage[]): number {
  let total = 0;
  for (const m of messages) total += messageChars(m);
  return total;
}

function cloneMessage(message: LlmMessage): LlmMessage {
  const out: LlmMessage = { role: message.role };
  if (message.content !== undefined) out.content = message.content;
  if (message.tool_calls !== undefined) out.tool_calls = message.tool_calls;
  if (message.tool_call_id !== undefined)
    out.tool_call_id = message.tool_call_id;
  if (message.name !== undefined) out.name = message.name;
  return out;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function truncateForContext(
  value: unknown,
  maxChars: number
): { text: string; truncated: boolean } {
  const raw = asText(value);
  if (raw.length <= maxChars) return { text: raw, truncated: false };
  return { text: `${raw.slice(0, maxChars)}…[truncated]`, truncated: true };
}

function toolHint(content: unknown, maxChars: number): string {
  const raw = asText(content).replace(/\s+/gu, " ").trim();
  if (!raw) return "";
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}…`;
}

function pathsFromMessage(message: LlmMessage): string[] {
  const found = new Set<string>();
  if (message.role === "tool") {
    for (const p of extractResultPaths(safeJson(message.content))) {
      found.add(p);
    }
    const direct = extractToolPath(safeJson(message.content));
    if (direct) found.add(direct);
  }
  if (message.role === "assistant" && Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls as Array<{
      function?: { arguments?: string; name?: string };
    }>) {
      const args = safeJson(call?.function?.arguments);
      const path = extractToolPath(args);
      if (path) found.add(path);
    }
  }
  if (message.role === "user" && typeof message.content === "string") {
    const re = /(?:^|[\s`"'])([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})\b/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message.content)) !== null) {
      if (m[1] && !m[1].includes("://")) found.add(m[1]);
    }
  }
  return [...found];
}

function safeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

export function stubToolContent(
  content: unknown,
  opts?: { toolCallId?: string; hintChars?: number }
): string {
  const hintChars = opts?.hintChars ?? AGENT_CONTEXT_DEFAULTS.toolStubHintChars;
  const hint = toolHint(content, hintChars);
  const id =
    typeof opts?.toolCallId === "string" && opts.toolCallId
      ? ` tool_call_id=${opts.toolCallId}`
      : "";
  const hintLine = hint ? ` Hint: ${hint}` : "";
  return `[compacted] Prior tool result omitted to save context.${id}.${hintLine} Re-run the tool or read_file/search if you still need the payload.`;
}

export function buildPrefixDigest(messages: LlmMessage[]): string {
  const userSnippets: string[] = [];
  const paths = new Set<string>();
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      const one = m.content.replace(/\s+/gu, " ").trim();
      if (!one.startsWith("[context compacted]")) {
        userSnippets.push(one.length > 140 ? `${one.slice(0, 140)}…` : one);
      }
    }
    for (const p of pathsFromMessage(m)) paths.add(p);
  }
  const lines = [
    "[context compacted]",
    "Earlier turns were omitted to fit the model context budget.",
    "Prior user asks (truncated, oldest→newer):",
  ];
  const recent = userSnippets.slice(-8);
  if (!recent.length) lines.push("(none captured)");
  else recent.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  if (paths.size) {
    lines.push(`Paths seen: ${[...paths].slice(0, 24).join(", ")}`);
  }
  lines.push(
    "Re-read .agent/plan.md and .agent/memory.md if present. Do not trust omitted tool payloads — call tools again (search / read_file / get_console / get_dom_snapshot as needed)."
  );
  return lines.join("\n");
}

function userTurnStarts(messages: LlmMessage[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === "user") starts.push(i);
  }
  return starts;
}

function truncateBodies(
  messages: LlmMessage[],
  maxChars: number
): LlmMessage[] {
  return messages.map(m => {
    const out = cloneMessage(m);
    if (out.role === "tool" || out.role === "assistant") {
      if (typeof out.content === "string" && out.content.length > maxChars) {
        out.content = truncateForContext(out.content, maxChars).text;
      }
    }
    return out;
  });
}

function stubOldToolResults(
  messages: LlmMessage[],
  keepRecent: number,
  hintChars: number
): { messages: LlmMessage[]; stubbedToolCount: number } {
  const toolIndexes: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.role === "tool") toolIndexes.push(i);
  }
  if (toolIndexes.length <= keepRecent) {
    return { messages, stubbedToolCount: 0 };
  }
  const keep = new Set(toolIndexes.slice(-keepRecent));
  let stubbedToolCount = 0;
  const next = messages.map((m, i) => {
    if (m.role !== "tool" || keep.has(i)) return m;
    const raw = asText(m.content);
    if (raw.startsWith("[compacted]")) return m;
    stubbedToolCount += 1;
    const out = cloneMessage(m);
    out.content = stubToolContent(m.content, {
      toolCallId: m.tool_call_id,
      hintChars,
    });
    return out;
  });
  return { messages: next, stubbedToolCount };
}

function dropOldUserTurns(
  messages: LlmMessage[],
  keepRecentUserTurns: number
): { messages: LlmMessage[]; droppedPrefixCount: number } {
  const starts = userTurnStarts(messages);
  if (starts.length <= keepRecentUserTurns) {
    return { messages, droppedPrefixCount: 0 };
  }
  const cut = starts[starts.length - keepRecentUserTurns];
  if (cut == null || cut <= 0) {
    return { messages, droppedPrefixCount: 0 };
  }
  // Keep leading system messages, then digest, then the kept suffix.
  let systemEnd = 0;
  while (
    systemEnd < messages.length &&
    messages[systemEnd]?.role === "system"
  ) {
    systemEnd += 1;
  }
  if (cut <= systemEnd) {
    return { messages, droppedPrefixCount: 0 };
  }
  const prefix = messages.slice(systemEnd, cut);
  const digest: LlmMessage = {
    role: "user",
    content: buildPrefixDigest(prefix),
  };
  const next = [
    ...messages.slice(0, systemEnd),
    digest,
    ...messages.slice(cut),
  ];
  return { messages: next, droppedPrefixCount: prefix.length };
}

/**
 * Build the message list for one chat.completions call.
 * Does not mutate the durable UI transcript — returns a send-time copy.
 */
export function compactMessagesForLlm(
  systemContent: string,
  transcript: LlmMessage[],
  options: CompactOptions = {}
): CompactResult {
  const maxChars = options.maxChars ?? AGENT_CONTEXT_DEFAULTS.maxChars;
  const keepRecentUserTurns =
    options.keepRecentUserTurns ?? AGENT_CONTEXT_DEFAULTS.keepRecentUserTurns;
  const keepRecentToolResults =
    options.keepRecentToolResults ??
    AGENT_CONTEXT_DEFAULTS.keepRecentToolResults;
  const toolResultMaxChars =
    options.toolResultMaxChars ?? AGENT_CONTEXT_DEFAULTS.toolResultMaxChars;
  const toolStubHintChars =
    options.toolStubHintChars ?? AGENT_CONTEXT_DEFAULTS.toolStubHintChars;

  let messages: LlmMessage[] = [
    { role: "system", content: systemContent },
    ...transcript
      .filter(m => m && m.role !== "system")
      .map(m => cloneMessage(m)),
  ];
  const charsBefore = messagesChars(messages);

  messages = truncateBodies(messages, toolResultMaxChars);

  let stubbedToolCount = 0;
  let droppedPrefixCount = 0;

  const stubPass = stubOldToolResults(
    messages,
    keepRecentToolResults,
    toolStubHintChars
  );
  messages = stubPass.messages;
  stubbedToolCount += stubPass.stubbedToolCount;

  if (messagesChars(messages) > maxChars) {
    const dropPass = dropOldUserTurns(messages, keepRecentUserTurns);
    messages = dropPass.messages;
    droppedPrefixCount += dropPass.droppedPrefixCount;
  }

  // Still over budget: stub more aggressively, then keep only last user turn.
  if (messagesChars(messages) > maxChars) {
    const stubPass2 = stubOldToolResults(messages, 2, toolStubHintChars);
    messages = stubPass2.messages;
    stubbedToolCount += stubPass2.stubbedToolCount;
  }
  if (messagesChars(messages) > maxChars && keepRecentUserTurns > 1) {
    const dropPass2 = dropOldUserTurns(messages, 1);
    messages = dropPass2.messages;
    droppedPrefixCount += dropPass2.droppedPrefixCount;
  }

  // Last resort: hard-trim the largest tool bodies again.
  if (messagesChars(messages) > maxChars) {
    messages = truncateBodies(
      messages,
      Math.max(400, Math.floor(toolResultMaxChars / 4))
    );
  }

  const charsAfter = messagesChars(messages);
  return {
    messages,
    charsBefore,
    charsAfter,
    stubbedToolCount,
    droppedPrefixCount,
    compacted:
      stubbedToolCount > 0 ||
      droppedPrefixCount > 0 ||
      charsAfter < charsBefore,
  };
}

/** Format opening-context notes from optional durable / README files. */
export function formatOpeningNotes(
  notes: OpeningNote[],
  maxChars: number = AGENT_CONTEXT_DEFAULTS.openingNoteMaxChars
): string {
  const parts: string[] = [];
  for (const note of notes) {
    if (!note?.path || typeof note.content !== "string") continue;
    const trimmed = note.content.trim();
    if (!trimmed) continue;
    const cut = truncateForContext(trimmed, maxChars);
    parts.push(
      `--- ${note.path} ---\n${cut.text}${note.truncated && !cut.truncated ? "\n…[truncated]" : ""}`
    );
  }
  return parts.join("\n\n");
}

export function formatOpeningFileList(
  files: string[],
  max: number = AGENT_CONTEXT_DEFAULTS.openingFileListMax
): string {
  const list = files.slice(0, max);
  const total = files.length;
  return `Target files (${total}): ${list.join(", ")}${
    total > max ? `, …(+${total - max} more)` : ""
  }`;
}

/** Contract / entry files preferred in opening project map (DEC-027). */
export const OPENING_ENTRY_PATHS = [
  "index.html",
  "functions.js",
  "controller.js",
] as const;

/**
 * Opening project map: entry files + top-level dirs + total count.
 * Prefer this over dumping the first N lexicographic paths (DEC-027).
 */
export function formatOpeningProjectSummary(opts: {
  filePaths: string[];
  /** Top-level directory paths (no trailing slash). */
  topDirPaths: string[];
}): string {
  const fileSet = new Set(opts.filePaths);
  const named: string[] = [];
  for (const p of OPENING_ENTRY_PATHS) {
    if (fileSet.has(p)) named.push(p);
  }
  for (const d of opts.topDirPaths) {
    const clean = d.replace(/\/+$/u, "");
    if (clean) named.push(`${clean}/`);
  }
  const total = opts.filePaths.length;
  return `Target project map: ${
    named.length ? named.join(", ") : "(empty)"
  }. ${total} file(s) total — use list_dir / search; do not list_files for structure.`;
}
