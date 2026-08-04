/**
 * Shared console → optional panel / DevTools mirror for Playgrounds iframes.
 * Canvas SW bridge keeps its own copy (must stay aligned with public/sw.js);
 * ESM hosts (functions.js / controller.js) inject this script.
 */

import {
  CONSOLE_MIRROR_HELLO_TYPE,
  CONSOLE_MIRROR_MESSAGE_TYPE,
  PLAYGROUNDS_PREFS_KEY,
} from "./playgroundsPrefs";

/** postMessage channel for hidden ESM host iframes (not the visible canvas). */
export const CONSOLE_CHANNEL_ESM_HOST = "esm-host";

/** Same-origin host windows that should receive mirror preference updates. */
const mirrorHostWindows = new Set<Window>();

export function registerMirrorConsoleWindow(
  win: Window | null | undefined
): void {
  if (!win || win.closed) return;
  mirrorHostWindows.add(win);
}

export function unregisterMirrorConsoleWindow(
  win: Window | null | undefined
): void {
  if (!win) return;
  mirrorHostWindows.delete(win);
}

export function forEachMirrorConsoleWindow(fn: (win: Window) => void): void {
  for (const win of [...mirrorHostWindows]) {
    if (win.closed) {
      mirrorHostWindows.delete(win);
      continue;
    }
    fn(win);
  }
}

/**
 * Inline classic script for functions / controller host iframes.
 * Defaults to not mirroring into DevTools; respects Settings via postMessage
 * and localStorage bootstrap. Does not feed the work Console panel (channel
 * is filtered in the shell) — same as before this patch for panel visibility.
 */
export function buildConsoleMirrorBridgeInlineScript(): string {
  return `<script data-playgrounds-console-mirror>
(function () {
  if (window.__playgroundsConsoleMirrorInstalled) return;
  window.__playgroundsConsoleMirrorInstalled = true;
  var mirrorToBrowser = false;
  try {
    var raw = localStorage.getItem(${JSON.stringify(PLAYGROUNDS_PREFS_KEY)});
    if (raw) {
      var prefs = JSON.parse(raw);
      mirrorToBrowser = !!prefs.mirrorConsoleToBrowser;
    }
  } catch (_) { /* ignore */ }
  function serializeArg(a) {
    if (a === null) return "null";
    if (a === undefined) return "undefined";
    var t = typeof a;
    if (t === "string") return a;
    if (t === "number" || t === "boolean" || t === "bigint") return String(a);
    if (t === "symbol") return a.toString();
    if (t === "function") {
      return "[Function" + (a.name ? (" " + a.name) : "") + "]";
    }
    if (a instanceof Error) {
      return a.stack || (a.name + ": " + a.message) || String(a);
    }
    try {
      return JSON.stringify(a);
    } catch (_) {
      try { return String(a); } catch (__) { return "[unserializable]"; }
    }
  }
  function postConsole(level, args) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-console",
        level: level,
        args: Array.prototype.map.call(args, serializeArg),
        channel: ${JSON.stringify(CONSOLE_CHANNEL_ESM_HOST)}
      }, "*");
    } catch (_) { /* ignore */ }
  }
  function patch(level, nativeFn) {
    return function () {
      postConsole(level, arguments);
      if (mirrorToBrowser) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }
  var _log = console.log.bind(console);
  var _info = console.info.bind(console);
  var _debug = console.debug.bind(console);
  var _warn = console.warn.bind(console);
  var _err = console.error.bind(console);
  var _table = console.table ? console.table.bind(console) : _log;
  var _dir = console.dir ? console.dir.bind(console) : _log;
  var _trace = console.trace ? console.trace.bind(console) : _log;
  var _group = console.group ? console.group.bind(console) : _log;
  var _groupCollapsed = console.groupCollapsed ? console.groupCollapsed.bind(console) : _group;
  var _groupEnd = console.groupEnd ? console.groupEnd.bind(console) : function () {};
  var _assert = console.assert ? console.assert.bind(console) : function () {};
  function patchSilent(nativeFn) {
    return function () {
      if (mirrorToBrowser) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }
  function patchGroup(kind, nativeFn) {
    return function () {
      var label = arguments.length ? Array.prototype.map.call(arguments, serializeArg).join(" ") : "";
      postConsole("info", [kind + (label ? (" " + label) : "")]);
      if (mirrorToBrowser) {
        try { nativeFn.apply(console, arguments); } catch (_) { /* ignore */ }
      }
    };
  }
  console.log = patch("info", _log);
  console.info = patch("info", _info);
  console.debug = patch("debug", _debug);
  console.warn = patch("warn", _warn);
  console.error = patch("error", _err);
  console.table = patch("info", _table);
  console.dir = patch("info", _dir);
  console.trace = patch("debug", _trace);
  console.group = patchGroup("▶", _group);
  console.groupCollapsed = patchGroup("▷", _groupCollapsed);
  console.groupEnd = patchSilent(_groupEnd);
  console.assert = function () {
    var args = arguments;
    if (args.length && args[0]) {
      if (mirrorToBrowser) {
        try { _assert.apply(console, args); } catch (_) { /* ignore */ }
      }
      return;
    }
    var rest = Array.prototype.slice.call(args, 1);
    if (!rest.length) rest = ["Assertion failed"];
    postConsole("error", rest);
    if (mirrorToBrowser) {
      try { _assert.apply(console, args); } catch (_) { /* ignore */ }
    }
  };
  window.addEventListener("message", function (ev) {
    var data = ev.data;
    if (!data || typeof data !== "object") return;
    if (data.type === ${JSON.stringify(CONSOLE_MIRROR_MESSAGE_TYPE)}) {
      mirrorToBrowser = !!data.enabled;
    }
  });
  window.addEventListener("error", function (e) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-error",
        message: String(e.message || e.error || "error"),
        channel: ${JSON.stringify(CONSOLE_CHANNEL_ESM_HOST)}
      }, "*");
    } catch (_) { /* ignore */ }
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  window.addEventListener("unhandledrejection", function (e) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-error",
        message: String(e.reason),
        channel: ${JSON.stringify(CONSOLE_CHANNEL_ESM_HOST)}
      }, "*");
    } catch (_) { /* ignore */ }
    try { e.preventDefault(); } catch (_) { /* ignore */ }
  });
  try {
    parent.postMessage({ type: ${JSON.stringify(CONSOLE_MIRROR_HELLO_TYPE)} }, "*");
  } catch (_) { /* ignore */ }
})();
</script>`;
}
