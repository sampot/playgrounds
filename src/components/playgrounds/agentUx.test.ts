import { describe, expect, it } from "vitest";
import {
  dequeueMessage,
  enqueueMessage,
  extractResultPaths,
  extractToolPath,
  formatStepLabel,
  formatWorkProjectLabel,
  getProviderPreset,
  parsePlanChecklist,
  PROVIDER_PRESETS,
  isLocalLlmBaseUrl,
  settingsReady,
  simpleUnifiedDiff,
  summarizeToolCall,
  summarizeToolResult,
  transcriptBeforeLastUser,
  transcriptForRetry,
} from "./agentUx";

describe("agentUx presets & settings", () => {
  it("exposes openai / groq / openrouter / local presets", () => {
    expect(PROVIDER_PRESETS.map(p => p.id)).toEqual([
      "openai",
      "groq",
      "openrouter",
      "local",
    ]);
    expect(getProviderPreset("groq")?.baseUrl).toContain("groq.com");
  });

  it("settingsReady requires secret for remote; local may omit secret", () => {
    expect(settingsReady({})).toBe(false);
    expect(settingsReady({ secretName: "OPENAI_API_KEY", baseUrl: "" })).toBe(
      false
    );
    expect(
      settingsReady({
        secretName: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
      })
    ).toBe(true);
    expect(
      settingsReady({ apiKey: "sk", baseUrl: "https://api.openai.com/v1" })
    ).toBe(true);
    expect(settingsReady({ baseUrl: "http://127.0.0.1:1234/v1" })).toBe(true);
    expect(settingsReady({ baseUrl: "http://localhost:11434/v1" })).toBe(true);
    expect(isLocalLlmBaseUrl("https://api.openai.com/v1")).toBe(false);
  });
});

describe("agentUx tool summaries", () => {
  it("summarizes write_file calls with path and size", () => {
    const s = summarizeToolCall("write_file", {
      path: "index.html",
      content: "a\nb\nc",
    });
    expect(s.path).toBe("index.html");
    expect(s.preview).toContain("index.html");
    expect(s.preview).toContain("3 行");
  });

  it("summarizes run_cmd results", () => {
    const s = summarizeToolResult("run_cmd", {
      exitCode: 0,
      stdout: "ok\n",
      written: ["out.txt"],
    });
    expect(s.preview).toContain("exit 0");
    expect(s.paths).toContain("out.txt");
  });

  it("extracts paths from nested results", () => {
    expect(extractToolPath({ path: "a.js" })).toBe("a.js");
    expect(extractResultPaths({ written: [{ path: "b.js" }, "c.js"] })).toEqual(
      ["b.js", "c.js"]
    );
  });
});

describe("agentUx diff & plan", () => {
  it("builds a short unified diff", () => {
    const diff = simpleUnifiedDiff("hello\n", "hello\nworld\n", "t.txt");
    expect(diff).toContain("--- a/t.txt");
    expect(diff).toContain("+world");
  });

  it("parses checklist items", () => {
    const items = parsePlanChecklist(`# Plan
- [ ] first
- [x] second
* [X] third
plain line
`);
    expect(items).toEqual([
      { done: false, text: "first" },
      { done: true, text: "second" },
      { done: true, text: "third" },
    ]);
  });
});

describe("agentUx queue & transcript", () => {
  it("enqueues and dequeues messages", () => {
    let q = enqueueMessage([], "  hi  ", 1);
    q = enqueueMessage(q, "next", 2);
    expect(q).toHaveLength(2);
    const { next, rest } = dequeueMessage(q);
    expect(next?.text).toBe("hi");
    expect(rest).toHaveLength(1);
  });

  it("formats step and work labels", () => {
    expect(formatStepLabel(2, 20, "write_file")).toBe("步驟 2/20 · write_file");
    expect(formatWorkProjectLabel("Demo", "id")).toBe("Demo");
    expect(formatWorkProjectLabel(null, null)).toBe("未選沙盒");
  });

  it("retries keep last user; edit drops last user", () => {
    const msgs = [
      { role: "user", content: "a" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "b" },
      { role: "assistant", content: "err" },
    ];
    expect(transcriptForRetry(msgs).map(m => m.content)).toEqual([
      "a",
      "ok",
      "b",
    ]);
    const edited = transcriptBeforeLastUser(msgs);
    expect(edited.lastUserText).toBe("b");
    expect(edited.kept.map(m => m.content)).toEqual(["a", "ok"]);
  });
});
