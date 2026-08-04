<script lang="ts">
  import { FitAddon } from "@xterm/addon-fit";
  import { Terminal } from "@xterm/xterm";
  import { onDestroy, onMount } from "svelte";
  import { fileContentToUtf8 } from "./hostBridge";
  import {
    JS_REPL_PRIMARY_PROMPT,
    cancelHostJsRepl,
    ensureHostJs,
    formatJsReplBanner,
    isJsScriptPath,
    replHostJs,
    resetHostJs,
  } from "./hostJs";
  import type { JsReplPrompt } from "./hostJsRepl";
  import { isBinaryContent, type FileMap } from "./projectTypes";
  import { normalizeProjectPath } from "./pathUtils";
  import { playgroundsXtermTheme } from "./playgroundsTheme";
  import "@xterm/xterm/css/xterm.css";

  interface Props {
    files?: FileMap;
    projectId?: string | null;
    disabled?: boolean;
    visible?: boolean;
    onStatus?: (detail: string) => void;
  }

  let {
    files = {},
    projectId = null,
    disabled = false,
    visible = true,
    onStatus,
  }: Props = $props();

  let hostEl = $state<HTMLDivElement | null>(null);
  let detail = $state("尚未載入");
  let busy = $state(false);
  let ready = $state(false);

  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lineBuf = "";
  let prompt: JsReplPrompt = JS_REPL_PRIMARY_PROMPT;
  let history: string[] = [];
  let historyIndex = -1;
  let booted = false;
  let bootAttempted = false;

  function collectProjectJsFiles(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [raw, content] of Object.entries(files)) {
      try {
        const path = normalizeProjectPath(raw);
        if (!isJsScriptPath(path)) continue;
        if (isBinaryContent(content)) continue;
        out[path] = fileContentToUtf8(content);
      } catch {
        /* skip */
      }
    }
    return out;
  }

  function setDetail(msg: string) {
    detail = msg;
    onStatus?.(msg);
  }

  function writePrompt() {
    term?.write(prompt);
  }

  function writeOutput(text: string) {
    if (!text || !term) return;
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const endsWithNl = normalized.endsWith("\n");
    const parts = normalized.split("\n");
    const last = parts.length - 1;
    for (let i = 0; i < parts.length; i++) {
      if (i < last || endsWithNl) {
        term.writeln(parts[i] ?? "");
      } else if (parts[i]) {
        term.write(parts[i]!);
      }
    }
  }

  function redrawInputLine() {
    term?.write(`\r${prompt}${lineBuf}\x1b[K`);
  }

  async function boot() {
    if (disabled || busy || booted) return;
    busy = true;
    bootAttempted = true;
    setDetail("啟動 JS Worker…");
    try {
      await ensureHostJs();
      ready = true;
      booted = true;
      term?.reset();
      for (const line of formatJsReplBanner().split("\n")) {
        term?.writeln(line);
      }
      term?.writeln("");
      prompt = JS_REPL_PRIMARY_PROMPT;
      lineBuf = "";
      writePrompt();
      setDetail("就緒");
      term?.focus();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      term?.writeln(`[錯誤] ${msg}`);
      setDetail(msg);
      booted = false;
      ready = false;
    } finally {
      busy = false;
    }
  }

  async function submitLine(raw: string) {
    if (!ready || busy) return;
    busy = true;
    try {
      const result = await replHostJs(raw, {
        projectId: projectId ?? undefined,
        projectFiles: collectProjectJsFiles(),
      });
      if (result.stdout) writeOutput(result.stdout);
      if (result.stderr) writeOutput(result.stderr);
      if (result.error) {
        term?.writeln(result.error);
      } else if (result.result) {
        term?.writeln(result.result);
      }
      prompt = result.prompt;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      term?.writeln(`[錯誤] ${msg}`);
      prompt = JS_REPL_PRIMARY_PROMPT;
    } finally {
      busy = false;
      writePrompt();
    }
  }

  async function handleReset() {
    if (busy || disabled) return;
    busy = true;
    try {
      await resetHostJs();
      prompt = JS_REPL_PRIMARY_PROMPT;
      lineBuf = "";
      term?.writeln("");
      term?.writeln("[playgrounds] 已重設 REPL");
      writePrompt();
      setDetail("已重設");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      term?.writeln(`[錯誤] ${msg}`);
      writePrompt();
    } finally {
      busy = false;
    }
  }

  function clearScreen() {
    term?.clear();
    lineBuf = "";
    writePrompt();
  }

  function onData(data: string) {
    if (!term || busy || !ready) return;

    if (data === "\x1b[A") {
      if (!history.length) return;
      if (historyIndex < 0) historyIndex = history.length;
      historyIndex = Math.max(0, historyIndex - 1);
      lineBuf = history[historyIndex] ?? "";
      redrawInputLine();
      return;
    }
    if (data === "\x1b[B") {
      if (historyIndex < 0) return;
      historyIndex += 1;
      if (historyIndex >= history.length) {
        historyIndex = -1;
        lineBuf = "";
      } else {
        lineBuf = history[historyIndex] ?? "";
      }
      redrawInputLine();
      return;
    }
    if (data.startsWith("\x1b")) return;

    for (const ch of data) {
      const code = ch.charCodeAt(0);
      if (ch === "\r") {
        term.write("\r\n");
        const toSend = lineBuf;
        if (toSend.trim()) {
          history.push(toSend);
          if (history.length > 200) history.shift();
        }
        historyIndex = -1;
        lineBuf = "";
        void submitLine(toSend);
        return;
      }
      if (code === 0x7f || code === 0x08) {
        if (lineBuf.length > 0) {
          lineBuf = lineBuf.slice(0, -1);
          term.write("\b \b");
        }
        continue;
      }
      if (code === 0x03) {
        term.write("^C\r\n");
        lineBuf = "";
        prompt = JS_REPL_PRIMARY_PROMPT;
        void cancelHostJsRepl()
          .catch(() => {})
          .finally(() => writePrompt());
        return;
      }
      if (code < 32) continue;
      lineBuf += ch;
      term.write(ch);
    }
  }

  function syncTerminalTheme() {
    if (!term) return;
    term.options.theme = playgroundsXtermTheme();
  }

  onMount(() => {
    if (!hostEl) return;
    const t = new Terminal({
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize: 12,
      theme: playgroundsXtermTheme(),
      convertEol: true,
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(hostEl);
    f.fit();
    term = t;
    fit = f;
    t.onData(d => onData(d));
    resizeObserver = new ResizeObserver(() => {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    });
    resizeObserver.observe(hostEl);
    document.addEventListener("theme-change", syncTerminalTheme);
    for (const line of formatJsReplBanner().split("\n")) {
      t.writeln(line);
    }
    t.writeln("");
    if (disabled) {
      t.writeln("請先開啟工作沙盒，再按「載入」。");
      setDetail("待開啟沙盒");
    } else {
      t.writeln("啟動中…");
      void boot();
    }
    return () => {
      document.removeEventListener("theme-change", syncTerminalTheme);
    };
  });

  $effect(() => {
    if (visible) {
      try {
        fit?.fit();
      } catch {
        /* ignore */
      }
    }
  });

  // Boot once when a work project becomes available after mount.
  $effect(() => {
    if (!disabled && !booted && !bootAttempted && !busy && term) {
      void boot();
    }
  });
  onDestroy(() => {
    document.removeEventListener("theme-change", syncTerminalTheme);
    resizeObserver?.disconnect();
    term?.dispose();
    term = null;
  });
</script>

<div
  class="playgrounds-js-repl bg-skin-fill text-skin-base flex h-full min-h-0 flex-col"
>
  <div
    class="border-skin-line flex h-8 shrink-0 items-center gap-2 border-b px-2.5 text-[11px]"
  >
    <span class="text-skin-base/50">JavaScript</span>
    <span class="text-skin-base/40 truncate font-mono text-[10px]">{detail}</span>
    <div class="ml-auto flex flex-wrap items-center gap-1">
      <button
        type="button"
        class="playgrounds-repl-btn"
        disabled={busy || disabled || ready}
        onclick={() => {
          bootAttempted = false;
          void boot();
        }}>載入</button
      >
      <button
        type="button"
        class="playgrounds-repl-btn"
        disabled={busy || disabled || !ready}
        onclick={() => clearScreen()}>清除畫面</button
      >
      <button
        type="button"
        class="playgrounds-repl-btn"
        disabled={busy || disabled || !ready}
        onclick={() => void handleReset()}>重設 REPL</button
      >
    </div>
  </div>
  <div bind:this={hostEl} class="playgrounds-js-repl-xterm min-h-0 flex-1 px-1 py-1"></div>
</div>

<style>
  .playgrounds-repl-btn {
    border: 1px solid rgb(var(--color-border));
    background: transparent;
    color: rgb(var(--color-text-base) / 0.75);
    border-radius: 0.25rem;
    padding: 0.15rem 0.45rem;
    font-size: 10px;
    line-height: 1.2;
  }
  .playgrounds-repl-btn:hover:not(:disabled) {
    border-color: rgb(var(--color-accent) / 0.7);
    color: rgb(var(--color-accent));
  }
  .playgrounds-repl-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .playgrounds-js-repl-xterm :global(.xterm) {
    height: 100%;
  }
  .playgrounds-js-repl-xterm :global(.xterm-viewport) {
    overflow-y: auto !important;
  }
</style>
