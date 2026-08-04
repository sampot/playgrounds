import { describe, expect, it } from "vitest";
import {
  AGENT_CONTEXT_DEFAULTS,
  buildPrefixDigest,
  compactMessagesForLlm,
  formatOpeningFileList,
  formatOpeningNotes,
  formatOpeningProjectSummary,
  messagesChars,
  stubToolContent,
  truncateForContext,
  type LlmMessage,
} from "./agentContext";

function longTool(n: number, id: string): LlmMessage {
  return {
    role: "tool",
    tool_call_id: id,
    content: "x".repeat(n),
  };
}

describe("agentContext truncate / stub", () => {
  it("truncates oversized strings", () => {
    const r = truncateForContext("abcdefghij", 4);
    expect(r.truncated).toBe(true);
    expect(r.text).toBe("abcd…[truncated]");
  });

  it("builds a compacted tool stub with id + hint", () => {
    const s = stubToolContent('{"path":"index.html","ok":true}', {
      toolCallId: "call_1",
      hintChars: 40,
    });
    expect(s.startsWith("[compacted]")).toBe(true);
    expect(s).toContain("tool_call_id=call_1");
    expect(s).toContain("index.html");
    expect(s).toContain("Re-run the tool");
  });
});

describe("compactMessagesForLlm", () => {
  it("keeps system + recent transcript under a small budget", () => {
    const transcript: LlmMessage[] = [];
    for (let i = 0; i < 5; i += 1) {
      transcript.push({ role: "user", content: `ask ${i} ` + "u".repeat(200) });
      transcript.push({
        role: "assistant",
        content: `reply ${i}`,
        tool_calls: [
          {
            id: `c${i}`,
            type: "function",
            function: {
              name: "read_file",
              arguments: JSON.stringify({ path: `f${i}.js` }),
            },
          },
        ],
      });
      transcript.push(longTool(3_000, `c${i}`));
    }

    const result = compactMessagesForLlm("SYSTEM", transcript, {
      maxChars: 8_000,
      keepRecentUserTurns: 2,
      keepRecentToolResults: 2,
      toolResultMaxChars: 1_000,
    });

    expect(result.messages[0]?.role).toBe("system");
    expect(result.compacted).toBe(true);
    expect(result.stubbedToolCount).toBeGreaterThan(0);
    expect(result.charsAfter).toBeLessThanOrEqual(result.charsBefore);
    expect(result.charsAfter).toBeLessThan(messagesChars(transcript) + 200);
    // Recent tool results still present (not all stubbed).
    const tools = result.messages.filter(m => m.role === "tool");
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(m => !String(m.content).startsWith("[compacted]"))).toBe(
      true
    );
  });

  it("inserts a digest when dropping old user turns", () => {
    const transcript: LlmMessage[] = [];
    for (let i = 0; i < 4; i += 1) {
      transcript.push({
        role: "user",
        content: `Please fix bug-${i} in app.js ` + "detail ".repeat(40),
      });
      transcript.push({
        role: "assistant",
        content: `done ${i} ` + "ok ".repeat(40),
      });
    }
    const result = compactMessagesForLlm("SYS", transcript, {
      maxChars: 500,
      keepRecentUserTurns: 1,
      keepRecentToolResults: 2,
    });
    expect(result.droppedPrefixCount).toBeGreaterThan(0);
    const digest = result.messages.find(
      m =>
        m.role === "user" &&
        typeof m.content === "string" &&
        m.content.startsWith("[context compacted]")
    );
    expect(digest).toBeTruthy();
    expect(String(digest?.content)).toContain("bug-");
    expect(String(digest?.content)).toContain(".agent/memory.md");
    // Last real user turn preserved after digest.
    const users = result.messages.filter(m => m.role === "user");
    expect(users.at(-1)?.content).toContain("bug-3");
  });

  it("is a no-op for short chats", () => {
    const transcript: LlmMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const result = compactMessagesForLlm("SYS", transcript, {
      maxChars: AGENT_CONTEXT_DEFAULTS.maxChars,
    });
    expect(result.stubbedToolCount).toBe(0);
    expect(result.droppedPrefixCount).toBe(0);
    expect(result.messages).toHaveLength(3);
  });
});

describe("opening context helpers", () => {
  it("formats file list with overflow marker", () => {
    const files = Array.from({ length: 45 }, (_, i) => `f${i}.js`);
    const s = formatOpeningFileList(files, 40);
    expect(s).toContain("Target files (45)");
    expect(s).toContain("(+5 more)");
  });

  it("formats opening project summary with entries and top dirs", () => {
    const s = formatOpeningProjectSummary({
      filePaths: [
        "index.html",
        "functions.js",
        "lib/a.js",
        "assets/x.png",
        "z-last.js",
      ],
      topDirPaths: ["assets", "lib"],
    });
    expect(s).toContain("index.html");
    expect(s).toContain("functions.js");
    expect(s).toContain("assets/");
    expect(s).toContain("lib/");
    expect(s).toContain("5 file(s) total");
    expect(s).toContain("list_dir");
    expect(s).not.toContain("z-last.js");
  });

  it("formats plan/memory notes with truncation", () => {
    const s = formatOpeningNotes(
      [
        {
          path: ".agent/memory.md",
          content: "Prefer teal accent.\n" + "z".repeat(100),
          truncated: false,
        },
      ],
      40
    );
    expect(s).toContain("--- .agent/memory.md ---");
    expect(s).toContain("Prefer teal");
    expect(s).toContain("…[truncated]");
  });
});

describe("buildPrefixDigest", () => {
  it("collects user asks and paths", () => {
    const d = buildPrefixDigest([
      { role: "user", content: "Edit styles.css please" },
      {
        role: "assistant",
        tool_calls: [
          {
            function: {
              name: "write_file",
              arguments: '{"path":"styles.css"}',
            },
          },
        ],
      },
      {
        role: "tool",
        content: '{"path":"styles.css","hash":"abc"}',
      },
    ]);
    expect(d).toContain("styles.css");
    expect(d).toContain("Edit styles.css");
  });
});
