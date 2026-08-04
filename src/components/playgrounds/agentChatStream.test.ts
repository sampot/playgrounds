import { describe, expect, it } from "vitest";
import {
  applyChatCompletionChunk,
  createChatStreamState,
  extractMathDelimiters,
  extractMermaidFences,
  finalizeStreamMessage,
  parseSseDataPayload,
  restoreMathPlaceholders,
} from "./agentChatStream";

describe("agentChatStream", () => {
  it("parses SSE data payloads", () => {
    expect(parseSseDataPayload("[DONE]")).toBeNull();
    expect(parseSseDataPayload('{"a":1}')).toEqual({ a: 1 });
    expect(parseSseDataPayload("not-json")).toBeNull();
  });

  it("accumulates content and tool_call argument fragments", () => {
    const state = createChatStreamState();
    applyChatCompletionChunk(state, {
      choices: [{ delta: { role: "assistant", content: "你好" } }],
    });
    applyChatCompletionChunk(state, {
      choices: [{ delta: { content: "世界" } }],
    });
    applyChatCompletionChunk(state, {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "c1",
                type: "function",
                function: { name: "read_file", arguments: '{"pa' },
              },
            ],
          },
        },
      ],
    });
    applyChatCompletionChunk(state, {
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { arguments: 'th":"a"}' } }],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
    expect(state.message.content).toBe("你好世界");
    expect(state.finishReason).toBe("tool_calls");
    const msg = finalizeStreamMessage(state);
    expect(msg.tool_calls?.[0]?.function).toEqual({
      name: "read_file",
      arguments: '{"path":"a"}',
    });
  });

  it("extracts mermaid fences", () => {
    const { markdown, diagrams } = extractMermaidFences(
      "前置\n```mermaid\nflowchart LR\n  A-->B\n```\n後"
    );
    expect(diagrams).toHaveLength(1);
    expect(diagrams[0]!.code).toContain("flowchart LR");
    expect(markdown).toContain('data-mermaid-id="m0"');
    expect(markdown).not.toContain("```mermaid");
  });

  it("extracts and restores math", () => {
    const { markdown, maths } = extractMathDelimiters(
      "面積 $a^2$ 與 $$E=mc^2$$"
    );
    expect(maths.length).toBeGreaterThanOrEqual(2);
    expect(markdown).toContain("%%MATH_");
    const html = restoreMathPlaceholders(markdown, maths, (tex, display) =>
      display ? `<div>${tex}</div>` : `<span>${tex}</span>`
    );
    expect(html).toContain("a^2");
    expect(html).toContain("E=mc^2");
    expect(html).not.toContain("%%MATH_");
  });
});
