import { describe, expect, it, vi } from "vitest";
import {
  browserDirectoryRootName,
  browserFilesToFileMap,
  fetchUrlToFile,
  filenameFromContentDisposition,
  filenameFromUrl,
  pathsToZip,
  shouldSkipLocalTransferPath,
} from "./workspaceTransfer";
import { unzipSync } from "fflate";

describe("filename helpers", () => {
  it("filenameFromUrl", () => {
    expect(filenameFromUrl("https://example.com/a/b/logo.png?x=1")).toBe(
      "logo.png"
    );
  });

  it("filenameFromContentDisposition", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="pack.apk"')
    ).toBe("pack.apk");
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''caf%C3%A9.bin"
      )
    ).toBe("café.bin");
  });
});

describe("pathsToZip", () => {
  it("zips selected paths", () => {
    const zip = pathsToZip(
      { "a.txt": "hello", "b/c.txt": "world", skip: "x" },
      ["a.txt", "b/c.txt"],
      { folderName: "out" }
    );
    const unzipped = unzipSync(zip);
    expect(new TextDecoder().decode(unzipped["out/a.txt"]!)).toBe("hello");
    expect(new TextDecoder().decode(unzipped["out/b/c.txt"]!)).toBe("world");
    expect(unzipped["out/skip"]).toBeUndefined();
  });

  it("rejects empty selection", () => {
    expect(() => pathsToZip({ a: "1" }, ["missing"])).toThrow();
  });
});

describe("browserDirectoryRootName", () => {
  it("returns shared webkitRelativePath root", () => {
    const a = new File(["1"], "a.js");
    Object.defineProperty(a, "webkitRelativePath", {
      value: "my-app/src/a.js",
    });
    const b = new File(["2"], "b.js");
    Object.defineProperty(b, "webkitRelativePath", {
      value: "my-app/b.js",
    });
    expect(browserDirectoryRootName([a, b])).toBe("my-app");
  });

  it("returns null for flat file picks", () => {
    expect(browserDirectoryRootName([new File(["x"], "a.txt")])).toBeNull();
  });
});

describe("shouldSkipLocalTransferPath", () => {
  it("skips VCS and node_modules trees", () => {
    expect(shouldSkipLocalTransferPath(".git/config")).toBe(true);
    expect(shouldSkipLocalTransferPath("proj/.git/HEAD")).toBe(true);
    expect(shouldSkipLocalTransferPath("node_modules/x/index.js")).toBe(true);
    expect(shouldSkipLocalTransferPath("pkg/node_modules/y")).toBe(true);
  });

  it("keeps project assets including png", () => {
    expect(shouldSkipLocalTransferPath("assets/tiles/Man1.png")).toBe(false);
    expect(shouldSkipLocalTransferPath("index.html")).toBe(false);
    expect(shouldSkipLocalTransferPath("src/app.js")).toBe(false);
  });
});

describe("browserFilesToFileMap", () => {
  it("maps files under destDir", async () => {
    const f = new File(["hi"], "note.txt", { type: "text/plain" });
    const map = await browserFilesToFileMap([f], "docs");
    expect(map["docs/note.txt"]).toBe("hi");
  });

  it("omits .git files from webkitdirectory picks", async () => {
    const keep = new File(["ok"], "index.html");
    Object.defineProperty(keep, "webkitRelativePath", {
      value: "pg-mahjong/index.html",
    });
    const git = new File(["x"], "config");
    Object.defineProperty(git, "webkitRelativePath", {
      value: "pg-mahjong/.git/config",
    });
    const map = await browserFilesToFileMap([keep, git], "");
    expect(map["index.html"]).toBe("ok");
    expect(map[".git/config"]).toBeUndefined();
  });

  it("strips shared webkitRelativePath root", async () => {
    const a = new File(["1"], "a.js");
    Object.defineProperty(a, "webkitRelativePath", {
      value: "proj/src/a.js",
    });
    const b = new File(["2"], "b.js");
    Object.defineProperty(b, "webkitRelativePath", {
      value: "proj/src/b.js",
    });
    const map = await browserFilesToFileMap([a, b], "");
    expect(map["src/a.js"]).toBe("1");
    expect(map["src/b.js"]).toBe("2");
  });

  it("keeps nested dirs under destDir after strip", async () => {
    const a = new File(["1"], "a.js");
    Object.defineProperty(a, "webkitRelativePath", {
      value: "proj/src/lib/a.js",
    });
    const b = new File(["2"], "readme.md");
    Object.defineProperty(b, "webkitRelativePath", {
      value: "proj/readme.md",
    });
    const map = await browserFilesToFileMap([a, b], "vendor");
    expect(map["vendor/src/lib/a.js"]).toBe("1");
    expect(map["vendor/readme.md"]).toBe("2");
  });
});

describe("fetchUrlToFile", () => {
  it("writes inferred path under destDir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: {
              "content-type": "application/octet-stream",
              "content-disposition": 'attachment; filename="x.bin"',
            },
          })
      )
    );
    const result = await fetchUrlToFile("https://cdn.example.com/ignored.dat", {
      destDir: "assets",
    });
    expect(result.path).toBe("assets/x.bin");
    expect(result.content).toBeInstanceOf(Uint8Array);
    expect([...(result.content as Uint8Array)]).toEqual([1, 2, 3]);
    vi.unstubAllGlobals();
  });

  it("surfaces CORS / network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(
      fetchUrlToFile("https://blocked.example.com/a.png", { destPath: "a.png" })
    ).rejects.toThrow(/CORS/);
    vi.unstubAllGlobals();
  });

  it("rejects non-http protocols", async () => {
    await expect(
      fetchUrlToFile("file:///etc/passwd", { destPath: "x" })
    ).rejects.toThrow(/http/);
  });
});
