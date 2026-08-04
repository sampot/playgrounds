/**
 * Authoritative console gate installed by the shell into canvas iframes.
 *
 * The SW-injected bridge can lag behind (sticky worker). After iframe load the
 * shell injects a same-realm patch so mirror-off never calls into DevTools, even
 * when the worker still ships an older dual-write bridge.
 */

import { CONSOLE_MIRROR_MESSAGE_TYPE } from "./playgroundsPrefs";

/** Bump when the injected patch set changes (forces re-install). */
const GATE_REV = "2";
const GATE_ATTR = "data-playgrounds-console-gate";

/**
 * Poll until the iframe document exists, then install the gate.
 * Beats deferred module console.log that would otherwise hit a sticky SW bridge.
 */
export function armCanvasConsoleGate(
  iframe: HTMLIFrameElement | null | undefined,
  mirror: boolean
): void {
  if (!iframe) return;
  let tries = 0;
  const id = window.setInterval(() => {
    tries += 1;
    try {
      const win = iframe.contentWindow;
      if (win?.document?.documentElement) {
        installCanvasConsoleGate(win, mirror);
        if (win.document.readyState === "complete" || tries > 100) {
          window.clearInterval(id);
        }
      }
    } catch {
      /* still navigating / opaque */
    }
    if (tries > 100) window.clearInterval(id);
  }, 8);
}

/**
 * Install / refresh the shell console gate on a same-origin canvas window.
 * Safe to call on every load and whenever the mirror preference changes.
 */
export function installCanvasConsoleGate(
  win: Window | null | undefined,
  mirror: boolean
): void {
  if (!win || win.closed) return;
  let doc: Document;
  try {
    doc = win.document;
  } catch {
    return;
  }

  // Live flag the injected script reads on every console call.
  try {
    (win as unknown as { __pgConsoleMirror?: boolean }).__pgConsoleMirror =
      Boolean(mirror);
  } catch {
    return;
  }

  const root = doc.documentElement;
  if (!root) return;
  if (root.getAttribute(GATE_ATTR) !== GATE_REV) {
    const script = doc.createElement("script");
    script.setAttribute(GATE_ATTR, GATE_REV);
    script.textContent = `(() => {
  if (window.__pgConsoleGateRev === "${GATE_REV}") return;
  window.__pgConsoleGateRev = "${GATE_REV}";
  window.__pgConsoleGateInstalled = true;
  if (typeof window.__pgConsoleMirror !== "boolean") {
    window.__pgConsoleMirror = false;
  }
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
    try { return JSON.stringify(a); }
    catch (_) {
      try { return String(a); } catch (__) { return "[unserializable]"; }
    }
  }
  function postConsole(level, args) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-console",
        level: level,
        args: Array.prototype.map.call(args, serializeArg)
      }, "*");
    } catch (_) {}
  }
  function patch(level, nativeFn) {
    return function () {
      postConsole(level, arguments);
      if (window.__pgConsoleMirror) {
        try { nativeFn.apply(console, arguments); } catch (_) {}
      }
    };
  }
  function patchSilent(nativeFn) {
    return function () {
      if (window.__pgConsoleMirror) {
        try { nativeFn.apply(console, arguments); } catch (_) {}
      }
    };
  }
  function patchGroup(kind, nativeFn) {
    return function () {
      var label = arguments.length ? Array.prototype.map.call(arguments, serializeArg).join(" ") : "";
      postConsole("info", [kind + (label ? (" " + label) : "")]);
      if (window.__pgConsoleMirror) {
        try { nativeFn.apply(console, arguments); } catch (_) {}
      }
    };
  }
  // Pristine natives from a blank child iframe (avoid binding a stale SW wrapper).
  var natives = null;
  try {
    var probe = document.createElement("iframe");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
    document.documentElement.appendChild(probe);
    var pc = probe.contentWindow && probe.contentWindow.console;
    if (pc && typeof pc.log === "function") {
      natives = {
        log: pc.log.bind(pc),
        info: (pc.info || pc.log).bind(pc),
        debug: (pc.debug || pc.log).bind(pc),
        warn: (pc.warn || pc.log).bind(pc),
        error: (pc.error || pc.log).bind(pc),
        table: (pc.table || pc.log).bind(pc),
        dir: (pc.dir || pc.log).bind(pc),
        trace: (pc.trace || pc.log).bind(pc),
        group: (pc.group || pc.log).bind(pc),
        groupCollapsed: (pc.groupCollapsed || pc.group || pc.log).bind(pc),
        groupEnd: (pc.groupEnd || function () {}).bind(pc),
        time: (pc.time || function () {}).bind(pc),
        timeEnd: (pc.timeEnd || function () {}).bind(pc),
        count: (pc.count || function () {}).bind(pc),
        clear: (pc.clear || function () {}).bind(pc)
      };
    }
    probe.remove();
  } catch (_) {}
  if (!natives) {
    natives = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      table: (console.table || console.log).bind(console),
      dir: (console.dir || console.log).bind(console),
      trace: (console.trace || console.log).bind(console),
      group: (console.group || console.log).bind(console),
      groupCollapsed: (console.groupCollapsed || console.group || console.log).bind(console),
      groupEnd: (console.groupEnd || function () {}).bind(console),
      time: (console.time || function () {}).bind(console),
      timeEnd: (console.timeEnd || function () {}).bind(console),
      count: (console.count || function () {}).bind(console),
      clear: (console.clear || function () {}).bind(console)
    };
  }
  console.log = patch("info", natives.log);
  console.info = patch("info", natives.info);
  console.debug = patch("debug", natives.debug);
  console.warn = patch("warn", natives.warn);
  console.error = patch("error", natives.error);
  console.table = patch("info", natives.table);
  console.dir = patch("info", natives.dir);
  console.trace = patch("debug", natives.trace);
  console.group = patchGroup("▶", natives.group);
  console.groupCollapsed = patchGroup("▷", natives.groupCollapsed);
  console.groupEnd = patchSilent(natives.groupEnd);
  console.time = patchSilent(natives.time);
  console.timeEnd = patch("info", natives.timeEnd);
  console.count = patch("info", natives.count);
  console.clear = patchSilent(natives.clear);
  window.__playgroundsSetConsoleMirror = function (enabled) {
    window.__pgConsoleMirror = !!enabled;
  };
  window.addEventListener("error", function (e) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-error",
        message: String(e.message || e.error || "error")
      }, "*");
    } catch (_) {}
    try { e.preventDefault(); } catch (_) {}
  });
  window.addEventListener("unhandledrejection", function (e) {
    try {
      parent.postMessage({
        type: "playgrounds-preview-error",
        message: String(e.reason)
      }, "*");
    } catch (_) {}
    try { e.preventDefault(); } catch (_) {}
  });
})();`;
    root.setAttribute(GATE_ATTR, GATE_REV);
    root.appendChild(script);
    script.remove();
  }

  setCanvasConsoleMirror(win, mirror);
}

export function setCanvasConsoleMirror(
  win: Window | null | undefined,
  mirror: boolean
): void {
  if (!win || win.closed) return;
  try {
    (win as unknown as { __pgConsoleMirror?: boolean }).__pgConsoleMirror =
      Boolean(mirror);
    const setter = (
      win as unknown as {
        __playgroundsSetConsoleMirror?: (enabled: boolean) => void;
      }
    ).__playgroundsSetConsoleMirror;
    setter?.(Boolean(mirror));
  } catch {
    /* ignore */
  }
  try {
    win.postMessage(
      { type: CONSOLE_MIRROR_MESSAGE_TYPE, enabled: Boolean(mirror) },
      "*"
    );
  } catch {
    /* ignore */
  }
}
