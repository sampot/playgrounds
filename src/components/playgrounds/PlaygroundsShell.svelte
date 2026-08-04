<script lang="ts">
  import { FitAddon } from "@xterm/addon-fit";
  import { Terminal } from "@xterm/xterm";
  import { onDestroy, onMount } from "svelte";
  import { HostBridgeError, fileContentToUtf8 } from "./hostBridge";
  import { runHostCmd } from "./hostWasi";
  import type { FileContent, FileMap } from "./projectTypes";
  import { completeShellLine } from "./shellComplete";
  import { createDefaultShellEnv } from "./shellEnv";
  import {
    dispatchShellLine,
    dispatchShellSegment,
    formatShellBanner,
    formatShellPrompt,
    listShellCommandNames,
    resolveShellFilePath,
    terminalDisplayWidth,
    visiblePromptLength,
    type ShellBuiltinResult,
    type ShellRedirects,
  } from "./shellReadline";
  import { buildXargsInvocations, parseXargsArgv } from "./shellXargs";
  import { playgroundsXtermTheme } from "./playgroundsTheme";
  import "@xterm/xterm/css/xterm.css";

  interface Props {
    files?: FileMap;
    /** Work sandbox id — enables OPFS SyncAccessHandle WASI (DEC-039). */
    projectId?: string | null;
    /** Work project display name for `user@project` prompt. */
    projectName?: string;
    disabled?: boolean;
    visible?: boolean;
    /** Persist WASI file writes back into the work project. */
    onWriteFiles?: (
      files: Record<string, FileContent>
    ) => void | Promise<void>;
    /** After OPFS-mode runCmd: reload paths; return contents for changed paths. */
    onPathsChanged?: (paths: {
      changed: string[];
      deleted: string[];
    }) =>
      | void
      | Promise<void>
      | Promise<Record<string, FileContent>>
      | Record<string, FileContent>;
    onStatus?: (detail: string) => void;
  }

  let {
    files = {},
    projectId = null,
    projectName = "project",
    disabled = false,
    visible = true,
    onWriteFiles,
    onPathsChanged,
    onStatus,
  }: Props = $props();

  let hostEl = $state<HTMLDivElement | null>(null);
  let detail = $state("就緒");
  let busy = $state(false);
  let cwd = $state("");
  let env = $state<Record<string, string>>(createDefaultShellEnv(""));
  let lastExit = $state(0);

  let term: Terminal | null = null;
  let fit: FitAddon | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let lineBuf = "";
  let cursor = 0;
  let history: string[] = [];
  let historyIndex = -1;
  let projectEpoch = 0;

  type ExecState = {
    cwd: string;
    env: Record<string, string>;
    working: FileMap;
    writes: FileMap;
    lastExit: number;
  };

  async function applyCmdResult(
    result: Awaited<ReturnType<typeof runHostCmd>>,
    state: ExecState
  ): Promise<void> {
    for (const [path, content] of Object.entries(result.filesOut)) {
      state.working[path] = content;
      state.writes[path] = content;
    }
    const changed = result.changedPaths ?? [];
    const deleted = result.deletedPaths ?? [];
    if (changed.length || deleted.length) {
      for (const path of deleted) {
        delete state.working[path];
        delete state.writes[path];
      }
      const reloaded = await onPathsChanged?.({ changed, deleted });
      if (reloaded && typeof reloaded === "object") {
        for (const [path, content] of Object.entries(reloaded)) {
          state.working[path] = content;
          state.writes[path] = content;
        }
      }
    }
  }

  function runCmdOpts(
    state: ExecState,
    extra: {
      cmd: string;
      args?: string[];
      stdin?: string;
      env?: Record<string, string>;
    }
  ) {
    return {
      ...extra,
      cwd: state.cwd || ".",
      env: extra.env,
      ...(projectId ? { projectId } : { files: state.working }),
    };
  }

  function setDetail(msg: string) {
    detail = msg;
    onStatus?.(msg);
  }

  function promptText(): string {
    return formatShellPrompt({
      cwd,
      projectName,
      user: env.USER || "playground",
      lastExit,
      color: true,
    });
  }

  function writePrompt() {
    term?.write(promptText());
  }

  function writeOutput(text: string) {
    if (!term || !text) return;
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
    if (!term) return;
    const prompt = promptText();
    term.write(`\r${prompt}${lineBuf}\x1b[K`);
    // CJK in project name / input is 2 cells; don't use string index as columns.
    const col =
      visiblePromptLength(prompt) +
      terminalDisplayWidth(lineBuf.slice(0, cursor)) +
      1;
    term.write(`\x1b[${col}G`);
  }

  function setLine(next: string, nextCursor?: number) {
    lineBuf = next;
    cursor =
      nextCursor === undefined
        ? next.length
        : Math.max(0, Math.min(nextCursor, next.length));
    redrawInputLine();
  }

  async function flushWrites(writes: FileMap) {
    if (!Object.keys(writes).length || !onWriteFiles) return;
    await onWriteFiles(writes);
    term?.writeln(`[已寫入 ${Object.keys(writes).length} 個檔案到沙盒]`);
  }

  function resolveRedirectPath(
    target: string,
    sessionCwd: string
  ): string | null {
    const r = resolveShellFilePath(sessionCwd, target);
    if ("error" in r) {
      term?.writeln(`[錯誤] ${r.error}`);
      return null;
    }
    return r.path;
  }

  function readStdinFile(
    working: FileMap,
    sessionCwd: string,
    redirects?: ShellRedirects
  ): { stdin: string } | { error: string } {
    if (!redirects?.stdinPath) return { stdin: "" };
    const path = resolveRedirectPath(redirects.stdinPath, sessionCwd);
    if (!path) return { error: "stdin 路徑無效" };
    const content = working[path];
    if (content === undefined) {
      return { error: `無此檔案：${path}` };
    }
    return { stdin: fileContentToUtf8(content) };
  }

  function applyStdoutRedirect(
    working: FileMap,
    writes: FileMap,
    sessionCwd: string,
    stdout: string,
    redirects?: ShellRedirects
  ): boolean {
    if (!redirects?.stdoutPath) {
      if (stdout) writeOutput(stdout);
      return true;
    }
    const path = resolveRedirectPath(redirects.stdoutPath, sessionCwd);
    if (!path) return false;
    const prev =
      redirects.stdoutAppend && working[path] !== undefined
        ? fileContentToUtf8(working[path]!)
        : "";
    const next = prev + stdout;
    working[path] = next;
    writes[path] = next;
    return true;
  }

  async function runXargs(
    argv: string[],
    stdin: string,
    state: ExecState,
    env: Record<string, string>,
    redirects: ShellRedirects | undefined,
    isLast: boolean
  ): Promise<{ stdout: string; exitCode: number; truncated: boolean }> {
    const parsed = parseXargsArgv(argv);
    if (!parsed.ok) {
      term?.writeln(`[錯誤] ${parsed.error}`);
      return { stdout: "", exitCode: 1, truncated: false };
    }
    const planned = buildXargsInvocations(parsed, stdin);
    if ("error" in planned) {
      term?.writeln(`[錯誤] ${planned.error}`);
      return { stdout: "", exitCode: 1, truncated: false };
    }
    let stdout = "";
    let exitCode = 0;
    let truncated = false;
    for (const inv of planned.invocations) {
      const result = await runHostCmd(
        runCmdOpts(state, {
          cmd: inv.cmd,
          args: inv.args,
          stdin: "",
          env,
        })
      );
      if (result.truncated) truncated = true;
      if (result.stderr) writeOutput(result.stderr);
      await applyCmdResult(result, state);
      stdout += result.stdout;
      exitCode = result.exitCode;
      if (result.exitCode !== 0) break;
    }
    if (isLast) {
      const ok = applyStdoutRedirect(
        state.working,
        state.writes,
        state.cwd,
        stdout,
        redirects
      );
      if (!ok) exitCode = 1;
      else if (exitCode !== 0) term?.writeln(`[exit ${exitCode}]`);
    }
    return { stdout, exitCode, truncated };
  }

  async function executeAction(
    action: Exclude<ShellBuiltinResult, { kind: "noop" | "chain" }>,
    state: ExecState
  ): Promise<void> {
    if (action.kind === "output") {
      if (action.clear) term?.clear();
      if (action.cwd !== undefined) state.cwd = action.cwd;
      if (action.env) state.env = action.env;
      const code = action.exitCode ?? 0;
      if (action.redirects?.stdoutPath) {
        if (code === 0 || action.text) {
          const ok = applyStdoutRedirect(
            state.working,
            state.writes,
            state.cwd,
            action.text ? `${action.text}\n` : "",
            action.redirects
          );
          state.lastExit = ok ? code : 1;
        } else {
          state.lastExit = code;
        }
      } else {
        if (action.text) writeOutput(action.text);
        state.lastExit = code;
      }
      return;
    }

    if (action.kind === "pipeline") {
      setDetail(`管線 ${action.stages.map(s => s.cmd).join(" | ")}…`);
      const stdinSrc = readStdinFile(
        state.working,
        state.cwd,
        action.redirects
      );
      if ("error" in stdinSrc) {
        term?.writeln(`[錯誤] ${stdinSrc.error}`);
        state.lastExit = 1;
        return;
      }
      let stdin = stdinSrc.stdin;
      let truncated = false;
      let exitCode = 0;
      for (let i = 0; i < action.stages.length; i++) {
        const stage = action.stages[i]!;
        const isLast = i === action.stages.length - 1;
        if (stage.cmd === "xargs") {
          const xr = await runXargs(
            stage.args,
            stdin,
            state,
            action.env,
            isLast ? action.redirects : undefined,
            isLast
          );
          truncated = truncated || xr.truncated;
          exitCode = xr.exitCode;
          if (!isLast && xr.exitCode !== 0) {
            if (xr.stdout) writeOutput(xr.stdout);
            term?.writeln(
              `[exit ${xr.exitCode}]（管線中止於第 ${i + 1} 段）`
            );
            break;
          }
          if (!isLast) stdin = xr.stdout;
          continue;
        }
        const result = await runHostCmd(
          runCmdOpts(state, {
            cmd: stage.cmd,
            args: stage.args,
            stdin,
            env: action.env,
          })
        );
        if (result.truncated) truncated = true;
        if (result.stderr) writeOutput(result.stderr);
        await applyCmdResult(result, state);
        exitCode = result.exitCode;
        if (!isLast && result.exitCode !== 0) {
          if (result.stdout) writeOutput(result.stdout);
          term?.writeln(
            `[exit ${result.exitCode}]（管線中止於第 ${i + 1} 段）`
          );
          break;
        }
        if (isLast) {
          const ok = applyStdoutRedirect(
            state.working,
            state.writes,
            state.cwd,
            result.stdout,
            action.redirects
          );
          if (!ok) exitCode = 1;
          else if (result.exitCode !== 0) {
            term?.writeln(`[exit ${result.exitCode}]`);
          }
        } else {
          stdin = result.stdout;
        }
      }
      state.lastExit = exitCode;
      if (truncated) term?.writeln("[輸出已截斷]");
      return;
    }

    if (action.kind === "host") {
      setDetail(`執行 ${action.cmd}…`);
      const stdinSrc = readStdinFile(
        state.working,
        state.cwd,
        action.redirects
      );
      if ("error" in stdinSrc) {
        term?.writeln(`[錯誤] ${stdinSrc.error}`);
        state.lastExit = 1;
        return;
      }
      if (action.cmd === "xargs") {
        const xr = await runXargs(
          action.args,
          stdinSrc.stdin,
          state,
          action.env,
          action.redirects,
          true
        );
        state.lastExit = xr.exitCode;
        if (xr.truncated) term?.writeln("[輸出已截斷]");
        return;
      }
      term?.writeln(`[錯誤] 未知 host 命令：${action.cmd}`);
      state.lastExit = 127;
      return;
    }

    setDetail(`執行 ${action.cmd}…`);
    const stdinSrc = readStdinFile(state.working, state.cwd, action.redirects);
    if ("error" in stdinSrc) {
      term?.writeln(`[錯誤] ${stdinSrc.error}`);
      state.lastExit = 1;
      return;
    }
    const result = await runHostCmd(
      runCmdOpts(state, {
        cmd: action.cmd,
        args: action.args,
        stdin: stdinSrc.stdin,
        env: action.env,
      })
    );
    if (result.stderr) writeOutput(result.stderr);
    await applyCmdResult(result, state);
    const ok = applyStdoutRedirect(
      state.working,
      state.writes,
      state.cwd,
      result.stdout,
      action.redirects
    );
    state.lastExit = ok ? result.exitCode : 1;
    if (result.exitCode !== 0) {
      term?.writeln(`[exit ${result.exitCode}]`);
    }
    if (result.truncated) {
      term?.writeln("[輸出已截斷]");
    }
  }

  async function submitLine(raw: string) {
    if (busy || disabled) return;
    busy = true;
    try {
      const top = dispatchShellLine(raw, {
        cwd,
        files,
        env,
        lastExit,
      });
      if (top.kind === "noop") return;

      const state: ExecState = {
        cwd,
        env: { ...env },
        working: { ...files },
        writes: {},
        lastExit,
      };

      const runOne = async (action: ShellBuiltinResult) => {
        if (action.kind === "noop") return;
        if (action.kind === "chain") {
          term?.writeln("[錯誤] 不支援巢狀命令鏈");
          state.lastExit = 1;
          return;
        }
        await executeAction(action, state);
      };

      if (top.kind === "chain") {
        setDetail("執行命令鏈…");
        for (let i = 0; i < top.segments.length; i++) {
          if (i > 0) {
            const op = top.ops[i - 1]!;
            if (op === "&&" && state.lastExit !== 0) continue;
            if (op === "||" && state.lastExit === 0) continue;
          }
          const action = dispatchShellSegment(top.segments[i]!, {
            cwd: state.cwd,
            files: state.working,
            env: state.env,
            lastExit: state.lastExit,
          });
          await runOne(action);
        }
      } else {
        await runOne(top);
      }

      cwd = state.cwd;
      env = state.env;
      lastExit = state.lastExit;
      await flushWrites(state.writes);
      setDetail("就緒");
    } catch (e) {
      const msg =
        e instanceof HostBridgeError
          ? `${e.code}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e);
      term?.writeln(`[錯誤] ${msg}`);
      setDetail(msg);
      lastExit = 127;
    } finally {
      busy = false;
      writePrompt();
    }
  }

  function clearScreen() {
    term?.clear();
    lineBuf = "";
    cursor = 0;
    writePrompt();
  }

  function resetCwd() {
    cwd = "";
    env = createDefaultShellEnv("");
    lastExit = 0;
    term?.writeln("[playgrounds] cwd → /；env 已重設");
    writePrompt();
  }

  function applyTabComplete() {
    if (!term) return;
    const result = completeShellLine({
      line: lineBuf,
      cursor,
      cwd,
      files,
      commands: listShellCommandNames(),
    });
    if (result.kind === "none") return;
    if (result.kind === "apply") {
      setLine(result.line, result.cursor);
      return;
    }
    term.write("\r\n");
    const cols = 4;
    const width = Math.max(
      ...result.matches.map(m => m.length),
      8
    );
    for (let i = 0; i < result.matches.length; i += cols) {
      const row = result.matches
        .slice(i, i + cols)
        .map(m => m.padEnd(width + 2))
        .join("");
      term.writeln(row.trimEnd());
    }
    writePrompt();
    term.write(lineBuf);
    cursor = result.cursor;
    redrawInputLine();
  }

  function deleteWordBefore() {
    if (cursor <= 0) return;
    let i = cursor;
    while (i > 0 && /\s/.test(lineBuf[i - 1]!)) i--;
    while (i > 0 && !/\s/.test(lineBuf[i - 1]!)) i--;
    setLine(lineBuf.slice(0, i) + lineBuf.slice(cursor), i);
  }

  function onData(data: string) {
    if (!term || busy || disabled) return;

    // CSI / special keys
    if (data === "\x1b[A") {
      if (!history.length) return;
      if (historyIndex < 0) historyIndex = history.length;
      historyIndex = Math.max(0, historyIndex - 1);
      setLine(history[historyIndex] ?? "");
      return;
    }
    if (data === "\x1b[B") {
      if (historyIndex < 0) return;
      historyIndex += 1;
      if (historyIndex >= history.length) {
        historyIndex = -1;
        setLine("");
      } else {
        setLine(history[historyIndex] ?? "");
      }
      return;
    }
    if (data === "\x1b[C") {
      if (cursor < lineBuf.length) {
        cursor += 1;
        redrawInputLine();
      }
      return;
    }
    if (data === "\x1b[D") {
      if (cursor > 0) {
        cursor -= 1;
        redrawInputLine();
      }
      return;
    }
    if (data === "\x1b[H" || data === "\x1b[1~" || data === "\x1b[7~") {
      cursor = 0;
      redrawInputLine();
      return;
    }
    if (data === "\x1b[F" || data === "\x1b[4~" || data === "\x1b[8~") {
      cursor = lineBuf.length;
      redrawInputLine();
      return;
    }
    if (data === "\x1b[3~") {
      if (cursor < lineBuf.length) {
        setLine(lineBuf.slice(0, cursor) + lineBuf.slice(cursor + 1), cursor);
      }
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
        cursor = 0;
        void submitLine(toSend);
        return;
      }
      if (ch === "\t" || code === 0x09) {
        applyTabComplete();
        return;
      }
      if (code === 0x7f || code === 0x08) {
        if (cursor > 0) {
          setLine(
            lineBuf.slice(0, cursor - 1) + lineBuf.slice(cursor),
            cursor - 1
          );
        }
        continue;
      }
      if (code === 0x01) {
        // Ctrl+A
        cursor = 0;
        redrawInputLine();
        continue;
      }
      if (code === 0x05) {
        // Ctrl+E
        cursor = lineBuf.length;
        redrawInputLine();
        continue;
      }
      if (code === 0x15) {
        // Ctrl+U
        setLine(lineBuf.slice(cursor), 0);
        continue;
      }
      if (code === 0x17) {
        // Ctrl+W
        deleteWordBefore();
        continue;
      }
      if (code === 0x0c) {
        // Ctrl+L — clear screen, keep input line
        term.clear();
        writePrompt();
        redrawInputLine();
        continue;
      }
      if (code === 0x03) {
        term.write("^C\r\n");
        lineBuf = "";
        cursor = 0;
        lastExit = 130;
        writePrompt();
        return;
      }
      if (code < 32) continue;
      setLine(
        lineBuf.slice(0, cursor) + ch + lineBuf.slice(cursor),
        cursor + 1
      );
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

    t.writeln(formatShellBanner());
    t.writeln("");
    writePrompt();
    setDetail("就緒");

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

  // Reset cwd when the work-project file set identity changes substantially
  // (parent remounts files after openProject — detect via key count + sample).
  $effect(() => {
    const keys = Object.keys(files).sort().join("\0");
    const epoch = keys.length;
    if (projectEpoch !== 0 && epoch !== projectEpoch) {
      cwd = "";
      env = createDefaultShellEnv("");
      lastExit = 0;
    }
    projectEpoch = epoch;
  });

  onDestroy(() => {
    document.removeEventListener("theme-change", syncTerminalTheme);
    resizeObserver?.disconnect();
    term?.dispose();
    term = null;
  });
</script>

<div
  class="playgrounds-shell bg-skin-fill text-skin-base flex h-full min-h-0 flex-col"
>
  <div
    class="border-skin-line flex h-8 shrink-0 items-center gap-2 border-b px-2.5 text-[11px]"
  >
    <span class="text-skin-base/50">Shell</span>
    <span class="text-skin-base/40 truncate font-mono text-[10px]">{detail}</span>
    <div class="ml-auto flex flex-wrap items-center gap-1">
      <button
        type="button"
        class="playgrounds-repl-btn"
        disabled={busy || disabled}
        onclick={() => clearScreen()}>清除畫面</button
      >
      <button
        type="button"
        class="playgrounds-repl-btn"
        disabled={busy || disabled}
        onclick={() => resetCwd()}>重設 cwd／env</button
      >
    </div>
  </div>
  <div bind:this={hostEl} class="playgrounds-shell-xterm min-h-0 flex-1 px-1 py-1"></div>
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
  .playgrounds-shell-xterm :global(.xterm) {
    height: 100%;
  }
  .playgrounds-shell-xterm :global(.xterm-viewport) {
    overflow-y: auto !important;
  }
</style>
