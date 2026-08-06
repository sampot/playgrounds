import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginSharedBootOpen,
  buildPlaygroundsOpenUrl,
  canBuildOpenUrlFromSource,
  clearOpenQueryParam,
  defaultNameFromOpenIntent,
  explainOpenFromUrlError,
  findSandboxIdByOpenSource,
  openSourceKey,
  openSourceKeyFromMetaSource,
  parseOpenIntent,
  pathnameLooksLikeSam,
  resetSharedBootOpenForTests,
  resolveSamPackageUrl,
  sourceLabelFromOpenIntent,
} from "./openFromUrl";

afterEach(() => {
  resetSharedBootOpenForTests();
});

describe("pathnameLooksLikeSam", () => {
  it("detects .sam basename", () => {
    expect(pathnameLooksLikeSam("/pkgs/Demo.sam")).toBe(true);
    expect(pathnameLooksLikeSam("/pkgs/Demo.SAM")).toBe(true);
    expect(pathnameLooksLikeSam("/pkgs/Demo.zip")).toBe(false);
    expect(pathnameLooksLikeSam("/repo")).toBe(false);
  });
});

describe("resolveSamPackageUrl", () => {
  it("rewrites github blob to raw", () => {
    expect(
      resolveSamPackageUrl(
        "https://github.com/acme/demo/blob/main/dist/app.sam"
      )
    ).toBe("https://raw.githubusercontent.com/acme/demo/main/dist/app.sam");
  });

  it("rewrites gitlab blob to raw", () => {
    expect(
      resolveSamPackageUrl(
        "https://gitlab.com/acme/demo/-/blob/main/dist/app.sam"
      )
    ).toBe("https://gitlab.com/acme/demo/-/raw/main/dist/app.sam");
  });

  it("leaves release assets and other hosts alone", () => {
    const release = "https://github.com/acme/demo/releases/download/v1/app.sam";
    expect(resolveSamPackageUrl(release)).toBe(release);
    const cdn = "https://cdn.example.com/app.sam";
    expect(resolveSamPackageUrl(cdn)).toBe(cdn);
  });
});

describe("parseOpenIntent", () => {
  it("returns null when open is absent", () => {
    expect(parseOpenIntent("")).toBeNull();
    expect(parseOpenIntent("?foo=1")).toBeNull();
  });

  it("parses .sam URL with default options", () => {
    const intent = parseOpenIntent(
      "?open=" + encodeURIComponent("https://cdn.example.com/tools/demo.sam")
    );
    expect(intent).toMatchObject({
      kind: "sam",
      url: "https://cdn.example.com/tools/demo.sam",
      displayUrl: "https://cdn.example.com/tools/demo.sam",
      options: { as: "work", state: "ask", fresh: false, view: "default" },
    });
  });

  it("parses as / state / name / fresh / view", () => {
    const intent = parseOpenIntent(
      "?open=acme/demo&as=agent&state=none&name=My+SAM&fresh=1&view=canvas"
    );
    expect(intent).toMatchObject({
      kind: "github",
      options: {
        as: "agent",
        state: "none",
        name: "My SAM",
        fresh: true,
        view: "canvas",
      },
    });
  });

  it("treats view=maximize_preview as canvas", () => {
    expect(
      parseOpenIntent("?open=acme/demo&view=maximize_preview")
    ).toMatchObject({
      options: { view: "canvas" },
    });
  });

  it("prefers .sam over github clone for blob package links", () => {
    const intent = parseOpenIntent(
      "?open=" +
        encodeURIComponent("https://github.com/acme/demo/blob/main/pkg/app.sam")
    );
    expect(intent?.kind).toBe("sam");
    if (intent?.kind === "sam") {
      expect(intent.url).toBe(
        "https://raw.githubusercontent.com/acme/demo/main/pkg/app.sam"
      );
    }
  });

  it("parses github repo and shorthand", () => {
    expect(
      parseOpenIntent(
        "?open=" + encodeURIComponent("https://github.com/acme/demo")
      )
    ).toMatchObject({
      kind: "github",
      ref: { owner: "acme", repo: "demo" },
    });
    expect(parseOpenIntent("?open=acme/demo")).toMatchObject({
      kind: "github",
      ref: { owner: "acme", repo: "demo" },
    });
  });

  it("parses gitlab project", () => {
    expect(
      parseOpenIntent(
        "?open=" +
          encodeURIComponent(
            "https://gitlab.com/acme/group/demo/-/tree/main/pkg"
          )
      )
    ).toMatchObject({
      kind: "gitlab",
      ref: {
        projectPath: "acme/group/demo",
        ref: "main",
        path: "pkg",
      },
    });
  });

  it("rejects empty and unrecognised values", () => {
    expect(parseOpenIntent("?open=")).toMatchObject({
      kind: "invalid",
      reason: "開啟來源為空（?open=）",
    });
    expect(parseOpenIntent("?open=not-a-source")).toMatchObject({
      kind: "invalid",
    });
  });
});

describe("clearOpenQueryParam", () => {
  it("removes open-related params and keeps others", () => {
    const replaceState = vi.fn();
    clearOpenQueryParam(
      {
        pathname: "/playgrounds/",
        search: "?open=acme/demo&as=agent&fresh=1&view=canvas&x=1",
        hash: "",
      },
      { replaceState }
    );
    expect(replaceState).toHaveBeenCalledWith(null, "", "/playgrounds/?x=1");
  });

  it("no-ops when open is absent", () => {
    const replaceState = vi.fn();
    clearOpenQueryParam(
      { pathname: "/playgrounds/", search: "?x=1", hash: "" },
      { replaceState }
    );
    expect(replaceState).not.toHaveBeenCalled();
  });
});

describe("openSourceKey / findSandboxIdByOpenSource", () => {
  it("matches equivalent github sources", () => {
    const a = parseOpenIntent("?open=acme/demo")!;
    const b = parseOpenIntent(
      "?open=" + encodeURIComponent("https://github.com/acme/demo")
    )!;
    expect(openSourceKey(a)).toBe(openSourceKey(b));
    expect(
      findSandboxIdByOpenSource(
        [{ id: "p1", source: "https://github.com/acme/demo" }],
        a
      )
    ).toBe("p1");
    expect(openSourceKeyFromMetaSource("playgrounds-agent-starter")).toBeNull();
  });
});

describe("defaultNameFromOpenIntent / sourceLabelFromOpenIntent", () => {
  it("derives name and source for sam and github", () => {
    const sam = parseOpenIntent(
      "?open=" + encodeURIComponent("https://cdn.example.com/Demo.sam")
    )!;
    expect(defaultNameFromOpenIntent(sam)).toBe("Demo");
    expect(sourceLabelFromOpenIntent(sam)).toBe(
      "https://cdn.example.com/Demo.sam"
    );

    const gh = parseOpenIntent("?open=acme/demo")!;
    expect(defaultNameFromOpenIntent(gh)).toBe("demo");
    expect(sourceLabelFromOpenIntent(gh)).toBe("https://github.com/acme/demo");
  });
});

describe("buildPlaygroundsOpenUrl / canBuildOpenUrlFromSource", () => {
  it("builds deep link on canonical origin by default (DEC-041)", () => {
    expect(buildPlaygroundsOpenUrl("acme/demo")).toBe(
      "https://play.samkuo.me/?open=acme%2Fdemo"
    );
    expect(
      buildPlaygroundsOpenUrl("acme/demo", {
        as: "agent",
        fresh: true,
      })
    ).toBe("https://play.samkuo.me/?open=acme%2Fdemo&as=agent&fresh=1");
  });

  it("allows legacy blog origin override", () => {
    expect(
      buildPlaygroundsOpenUrl("acme/demo", {
        origin: "https://samkuo.me",
        playgroundsPath: "/playgrounds/",
      })
    ).toBe("https://samkuo.me/playgrounds/?open=acme%2Fdemo");
  });

  it("rejects local-only / starter sources", () => {
    expect(canBuildOpenUrlFromSource("playgrounds-agent-starter")).toBe(false);
    expect(canBuildOpenUrlFromSource("https://gitlab.com/a/b")).toBe(true);
  });
});

describe("explainOpenFromUrlError", () => {
  it("adds CORS and git API hints", () => {
    expect(
      explainOpenFromUrlError(new Error("無法下載（未開放 CORS）"), "sam")
    ).toMatch(/CORS/);
    expect(
      explainOpenFromUrlError(new Error("無法讀取儲存庫（HTTP 403）"), "github")
    ).toMatch(/頻率限制|公開/);
    expect(explainOpenFromUrlError(new Error("其他"), "unknown")).toBe("其他");
  });
});

describe("beginSharedBootOpen", () => {
  it("shares one in-flight run for the same search", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      await Promise.resolve();
      return true;
    };
    const a = beginSharedBootOpen("?open=acme/demo", run);
    const b = beginSharedBootOpen("?open=acme/demo", run);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    expect(runs).toBe(1);
  });

  it("allows a new run after the previous finishes", async () => {
    let runs = 0;
    const run = async () => {
      runs += 1;
      return true;
    };
    await beginSharedBootOpen("?open=acme/demo", run);
    await beginSharedBootOpen("?open=acme/demo", run);
    expect(runs).toBe(2);
  });
});
