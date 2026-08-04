/**
 * OpenAI-compatible chat.completions SSE helpers for the agent starter (Phase 10).
 * Pure logic — no DOM / fetch.
 */

export interface StreamToolCallAccum {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamMessageAccum {
  role?: string;
  content: string;
  tool_calls?: StreamToolCallAccum[];
}

export interface ChatStreamState {
  message: StreamMessageAccum;
  finishReason: string | null;
}

export function createChatStreamState(): ChatStreamState {
  return {
    message: { role: "assistant", content: "" },
    finishReason: null,
  };
}

/** Parse one SSE `data:` payload (JSON object or `[DONE]`). */
export function parseSseDataPayload(data: string): unknown | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * Apply one chat.completion.chunk delta onto accum state.
 * Mutates `state` in place; returns whether content changed.
 */
export function applyChatCompletionChunk(
  state: ChatStreamState,
  chunk: unknown
): { contentChanged: boolean } {
  if (!chunk || typeof chunk !== "object") return { contentChanged: false };
  const c = chunk as {
    choices?: Array<{
      delta?: {
        role?: string;
        content?: string | null;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }>;
      };
      finish_reason?: string | null;
    }>;
  };
  const choice = c.choices?.[0];
  if (!choice) return { contentChanged: false };
  if (choice.finish_reason) {
    state.finishReason = choice.finish_reason;
  }
  const delta = choice.delta;
  if (!delta) return { contentChanged: false };

  let contentChanged = false;
  if (delta.role) state.message.role = delta.role;
  if (typeof delta.content === "string" && delta.content) {
    state.message.content += delta.content;
    contentChanged = true;
  }
  if (Array.isArray(delta.tool_calls)) {
    if (!state.message.tool_calls) state.message.tool_calls = [];
    for (const tc of delta.tool_calls) {
      const index = typeof tc.index === "number" ? tc.index : 0;
      while (state.message.tool_calls.length <= index) {
        state.message.tool_calls.push({
          function: { name: "", arguments: "" },
        });
      }
      const slot = state.message.tool_calls[index]!;
      if (tc.id) slot.id = tc.id;
      if (tc.type) slot.type = tc.type;
      if (!slot.function) slot.function = { name: "", arguments: "" };
      if (tc.function?.name) {
        slot.function.name = (slot.function.name || "") + tc.function.name;
      }
      if (typeof tc.function?.arguments === "string") {
        slot.function.arguments =
          (slot.function.arguments || "") + tc.function.arguments;
      }
    }
  }
  return { contentChanged };
}

/** Finalize accumulated stream message into a chat message object. */
export function finalizeStreamMessage(state: ChatStreamState): {
  role: string;
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function: { name: string; arguments: string };
  }>;
} {
  const msg: {
    role: string;
    content?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
  } = {
    role: state.message.role || "assistant",
  };
  if (state.message.content) msg.content = state.message.content;
  if (state.message.tool_calls?.length) {
    msg.tool_calls = state.message.tool_calls.map((tc, i) => ({
      id: tc.id || `call_${i}`,
      type: tc.type || "function",
      function: {
        name: tc.function?.name || "",
        arguments: tc.function?.arguments || "{}",
      },
    }));
  }
  if (!msg.content && !msg.tool_calls) {
    msg.content = "";
  }
  return msg;
}

export interface MermaidExtract {
  markdown: string;
  diagrams: { id: string; code: string }[];
}

/** Replace ```mermaid fences with HTML placeholders before marked.parse. */
export function extractMermaidFences(markdown: string): MermaidExtract {
  const diagrams: { id: string; code: string }[] = [];
  const markdownOut = markdown.replace(
    /```mermaid\s*\n([\s\S]*?)```/giu,
    (_full, code: string) => {
      const id = `m${diagrams.length}`;
      diagrams.push({ id, code: String(code).trim() });
      return `\n\n<div class="mermaid-slot" data-mermaid-id="${id}"></div>\n\n`;
    }
  );
  return { markdown: markdownOut, diagrams };
}

export interface MathExtract {
  markdown: string;
  maths: { id: string; tex: string; display: boolean }[];
}

/** Pull $$…$$ / $…$ into placeholders so marked won't mangle them. */
export function extractMathDelimiters(markdown: string): MathExtract {
  const maths: { id: string; tex: string; display: boolean }[] = [];
  let out = markdown.replace(/\$\$([\s\S]+?)\$\$/gu, (_full, tex: string) => {
    const id = `eq${maths.length}`;
    maths.push({ id, tex: String(tex).trim(), display: true });
    return `%%MATH_${id}%%`;
  });
  out = out.replace(
    /(^|[^\\$])\$([^\s$][^$\n]*?[^\s$])\$(?![0-9])/gu,
    (_full, prefix: string, tex: string) => {
      const id = `eq${maths.length}`;
      maths.push({ id, tex: String(tex).trim(), display: false });
      return `${prefix}%%MATH_${id}%%`;
    }
  );
  return { markdown: out, maths };
}

export function restoreMathPlaceholders(
  html: string,
  maths: MathExtract["maths"],
  renderTex: (tex: string, display: boolean) => string
): string {
  let out = html;
  for (const m of maths) {
    let rendered: string;
    try {
      rendered = renderTex(m.tex, m.display);
    } catch {
      rendered = m.display
        ? `<pre class="math-error">${escapeHtml(m.tex)}</pre>`
        : `<code class="math-error">${escapeHtml(m.tex)}</code>`;
    }
    out = out.split(`%%MATH_${m.id}%%`).join(rendered);
  }
  return out;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}
