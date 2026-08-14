import { describe, expect, it } from "vitest";
import {
  buildCanvasEntryUrl,
  buildCanvasSyncMessage,
  fileMapToSyncFiles,
  functionsNoShellBody,
  functionsUnavailableBody,
  projectNotReadyBody,
  FUNCTIONS_NO_SHELL_ERROR,
  PROJECT_NOT_READY_ERROR,
  injectCanvasBridge,
  isCanvasApiPath,
  isCanvasPathname,
  isPlaygroundsShellPath,
  mimeForCanvasPath,
  parseCanvasUrlPath,
  resolveCanvasFilePath,
  FUNCTIONS_UNAVAILABLE_ERROR,
} from "./canvasSwProtocol";

describe("parseCanvasUrlPath", () => {
  it("parses project id and file path", () => {
    expect(
      parseCanvasUrlPath("/playgrounds/canvas/demo-abc123/index.html")
    ).toEqual({
      sandboxId: "demo-abc123",
      filePath: "index.html",
    });
  });

  it("parses nested paths and rejects escape", () => {
    expect(
      parseCanvasUrlPath("/playgrounds/canvas/p1/assets/logo.png")
    ).toEqual({
      sandboxId: "p1",
      filePath: "assets/logo.png",
    });
    expect(parseCanvasUrlPath("/playgrounds/canvas/p1/../secret")).toBeNull();
  });

  it("returns empty filePath for trailing slash / project root", () => {
    expect(parseCanvasUrlPath("/playgrounds/canvas/p1/")).toEqual({
      sandboxId: "p1",
      filePath: "",
    });
  });

  it("decodes project id", () => {
    expect(
      parseCanvasUrlPath("/playgrounds/canvas/my%20app/index.html")
    ).toEqual({
      sandboxId: "my app",
      filePath: "index.html",
    });
  });

  it("parses standalone /canvas/ prefix (DEC-041)", () => {
    expect(parseCanvasUrlPath("/canvas/demo/index.html")).toEqual({
      sandboxId: "demo",
      filePath: "index.html",
    });
  });
});

describe("resolveCanvasFilePath / api / mime", () => {
  it("defaults empty path to index.html", () => {
    expect(resolveCanvasFilePath("")).toBe("index.html");
    expect(resolveCanvasFilePath("app.js")).toBe("app.js");
  });

  it("detects api stub paths", () => {
    expect(isCanvasApiPath("api")).toBe(true);
    expect(isCanvasApiPath("api/hello")).toBe(true);
    expect(isCanvasApiPath("apiv1")).toBe(false);
    expect(isCanvasApiPath("index.html")).toBe(false);
  });

  it("maps common mime types", () => {
    expect(mimeForCanvasPath("a.js")).toContain("javascript");
    expect(mimeForCanvasPath("a.css")).toBe("text/css");
    expect(mimeForCanvasPath("a.png")).toBe("image/png");
    expect(mimeForCanvasPath("a.woff2")).toBe("font/woff2");
  });
});

describe("shell vs canvas path helpers", () => {
  it("classifies canvas vs shell paths (blog + standalone prefixes)", () => {
    expect(isCanvasPathname("/playgrounds/canvas/x/y")).toBe(true);
    expect(isCanvasPathname("/canvas/x/y")).toBe(true);
    expect(isPlaygroundsShellPath("/playgrounds/")).toBe(true);
    expect(isPlaygroundsShellPath("/playgrounds/canvas/x")).toBe(false);
    expect(isPlaygroundsShellPath("/playgrounds/index.html")).toBe(true);
  });
});

describe("sync serialization", () => {
  it("serializes text and binary files", () => {
    const files = fileMapToSyncFiles({
      "index.html": "<!doctype html>",
      "logo.png": new Uint8Array([1, 2, 3]),
    });
    expect(files["index.html"]).toEqual({
      type: "text",
      body: "<!doctype html>",
    });
    expect(files["logo.png"]?.type).toBe("bytes");
    expect(files["logo.png"]?.body).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(files["logo.png"]!.body as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("builds sync message and entry URL", () => {
    const msg = buildCanvasSyncMessage("pid", 7, { "a.js": "1" });
    expect(msg.type).toBe("playgrounds-canvas-sync");
    expect(msg.sandboxId).toBe("pid");
    expect(msg.generation).toBe(7);
    expect(buildCanvasEntryUrl("pid", 7)).toBe(
      "/playgrounds/canvas/pid/index.html?v=7"
    );
  });
});

describe("api stub + HTML bridge", () => {
  it("returns functions unavailable JSON", () => {
    const body = JSON.parse(functionsUnavailableBody()) as {
      error: string;
      message: string;
    };
    expect(body.error).toBe(FUNCTIONS_UNAVAILABLE_ERROR);
    expect(body.message).toContain("functions.js");
  });

  it("returns quiet project_not_ready / no_shell JSON", () => {
    const notReady = JSON.parse(projectNotReadyBody()) as {
      ready: boolean;
      code: string;
    };
    expect(notReady.ready).toBe(false);
    expect(notReady.code).toBe(PROJECT_NOT_READY_ERROR);
    const noShell = JSON.parse(functionsNoShellBody()) as {
      ready: boolean;
      code: string;
    };
    expect(noShell.ready).toBe(false);
    expect(noShell.code).toBe(FUNCTIONS_NO_SHELL_ERROR);
  });

  it("injects console bridge into head", () => {
    const out = injectCanvasBridge(
      "<!doctype html><html><head><title>t</title></head><body></body></html>"
    );
    expect(out).toContain("data-playgrounds-bridge");
    expect(out).toContain("playgrounds-preview-console");
    expect(out).toContain("playgrounds-preview-network");
    expect(out).toContain("playgrounds-dom-snapshot-request");
    expect(out).toContain("playgrounds-console-mirror");
    expect(out).toContain("playgrounds-console-mirror-hello");
    expect(out).toContain("mirrorToBrowser");
    expect(out).toContain("serializeArg");
    expect(out).toContain("playgrounds-prefs-v1");
    expect(out).toContain("patchConsole");
    expect(out).toContain("wantMirror");
    expect(out).toContain("__pgConsoleMirror");
    expect(out).toContain("preventDefault");
    expect(out).toContain('patchConsole("debug"');
    expect(out).toContain('console.log = patchConsole("info"');
    expect(out).toContain("canvas-bridge-rev:9");
    expect(out).toContain("console.group");
    expect(out).toContain("groupCollapsed");
    expect(out).toContain("groupEnd");
    expect(injectCanvasBridge(out)).toBe(out);
  });

  it("injects UI SDK script tag alongside the bridge", () => {
    const out = injectCanvasBridge(
      "<!doctype html><html><head><title>t</title></head><body></body></html>"
    );
    // SDK script must load before user code so `window.PG` is available at
    // first paint. `defer` lets the parser continue; SDK is self-mounting.
    expect(out).toContain(
      '<script src="/playgrounds/sdk.js" defer data-playgrounds-sdk>'
    );
    // Idempotent: re-injecting does not duplicate the SDK tag.
    expect(injectCanvasBridge(out)).toBe(out);
  });

  it("injects localStorage→KV shim before user code (idempotent)", () => {
    const out = injectCanvasBridge(
      "<!doctype html><html><head><title>t</title></head><body></body></html>"
    );
    expect(out).toContain("data-playgrounds-ls-shim");
    expect(out).toContain("ls-shim-rev:1");
    // shim installs before the bridge so first paint sees the proxy
    const shimIdx = out.indexOf("data-playgrounds-ls-shim");
    const bridgeIdx = out.indexOf("data-playgrounds-bridge");
    expect(shimIdx).toBeGreaterThanOrEqual(0);
    expect(shimIdx).toBeLessThan(bridgeIdx);
    // namespace + best-effort flush markers present
    expect(out).toContain('PREFIX = "ls:"');
    expect(out).toContain("localStorage-shim");
    // _hydrate is deferred via setTimeout so the canvas bridge's fetch override
    // is installed before the POST /api/kv/list goes out (fixes 405 on go-client).
    expect(out).toContain("setTimeout(function () { shim._hydrate(); }, 0);");
    // Idempotent: re-injecting does not duplicate the shim marker.
    expect(injectCanvasBridge(out)).toBe(out);
  });

  it("does not inject shim into go's legacy score-shim-only HTML again", () => {
    // go injects its own `data-go-score-ns` marker; the ls-shim must not
    // double-wrap. Idempotency is keyed on its own marker.
    const go = injectCanvasBridge(
      '<!doctype html><html><head><script data-go-score-ns></script></head><body></body></html>'
    );
    const again = injectCanvasBridge(go);
    const count = (again.match(/data-playgrounds-ls-shim/g) || []).length;
    expect(count).toBe(1);
  });
});
