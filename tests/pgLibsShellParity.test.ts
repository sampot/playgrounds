/**
 * PG-LIBS-SPEC dual-shell parity: play (`public/`) and go
 * (`go-client/static/`) ship the same SDK + libs, inject the same bridge
 * SDK tag, and never SW-precache `/playgrounds/libs/**`.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { injectCanvasBridge } from "../src/components/playgrounds/canvasSwProtocol";
import {
  isPlaygroundsLibsPath,
  selectOfflineFetchStrategy,
} from "../src/utils/swOfflineStrategy";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const playLibs = join(root, "public/playgrounds/libs");
const goLibs = join(root, "go-client/static/playgrounds/libs");
const playSdk = join(root, "public/playgrounds/sdk.js");
const goSdk = join(root, "go-client/static/playgrounds/sdk.js");
const playDts = join(root, "public/playgrounds/sdk.d.ts");
const goDts = join(root, "go-client/static/playgrounds/sdk.d.ts");
const playSw = join(root, "public/sw.js");
const goSw = join(root, "go-client/static/sw.js");
const pinPath = join(playLibs, "pin.json");

function sha256(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

type PinEntry = {
  id: string;
  file: string;
  licenseFile?: string;
};

describe("PG.libs dual-shell parity", () => {
  it("sdk.js and sdk.d.ts are byte-identical on play and go", () => {
    expect(existsSync(goSdk)).toBe(true);
    expect(existsSync(goDts)).toBe(true);
    expect(sha256(playSdk)).toBe(sha256(goSdk));
    expect(sha256(playDts)).toBe(sha256(goDts));
    expect(readFileSync(playSdk, "utf8")).toMatch(/\blibs:\s*makeLibs\s*\(\s*\)/u);
    expect(readFileSync(playDts, "utf8")).toMatch(/\blibs\s*:\s*PgLibs\b/u);
  });

  it("every pin.json file+LICENSE matches on play and go", () => {
    const pin = JSON.parse(readFileSync(pinPath, "utf8")) as Record<
      string,
      PinEntry
    >;
    expect(Object.keys(pin).length).toBe(9);
    for (const entry of Object.values(pin)) {
      const playFile = join(playLibs, entry.file);
      const goFile = join(goLibs, entry.file);
      expect(existsSync(playFile), playFile).toBe(true);
      expect(existsSync(goFile), goFile).toBe(true);
      expect(sha256(playFile), entry.file).toBe(sha256(goFile));
      const lic = entry.licenseFile ?? `LICENSE-${entry.id}.txt`;
      expect(sha256(join(playLibs, lic))).toBe(sha256(join(goLibs, lic)));
    }
    // Directory listing parity (no stale extras on either side).
    const playNames = new Set(readdirSync(playLibs));
    const goNames = new Set(readdirSync(goLibs));
    expect([...playNames].sort()).toEqual([...goNames].sort());
  });

  it("shared injectCanvasBridge injects /playgrounds/sdk.js for both shells", () => {
    const html = injectCanvasBridge(
      "<!doctype html><html><head></head><body></body></html>",
    );
    expect(html).toContain(
      '<script src="/playgrounds/sdk.js" defer data-playgrounds-sdk>',
    );
    // Bridge must not preload any lib script.
    expect(html).not.toMatch(/playgrounds\/libs\//u);
  });

  it("play strategy: libs passthrough; sdk remains offline-eligible", () => {
    expect(isPlaygroundsLibsPath("/playgrounds/libs/phaser-4.2.1.min.js")).toBe(
      true,
    );
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/libs/phaser-4.2.1.min.js",
        requestMode: "cors",
      }),
    ).toBe("passthrough");
    expect(
      selectOfflineFetchStrategy({
        pathname: "/playgrounds/sdk.js",
        requestMode: "cors",
      }),
    ).toBe("network-first-document");
  });

  it("play + go SW sources never precache /playgrounds/libs/", () => {
    const play = readFileSync(playSw, "utf8");
    const go = readFileSync(goSw, "utf8");
    expect(play).toMatch(/isPlaygroundsLibsPath/u);
    expect(play).toMatch(/PG-LIBS-SPEC G6/u);
    expect(go).toMatch(/playgrounds\/libs/u);
    expect(go).toMatch(/PG-LIBS-SPEC G6/u);
    // extractShellAssetUrls must not hardcode libs URLs
    expect(play).not.toMatch(
      /extractShellAssetUrls[\s\S]{0,800}playgrounds\/libs/u,
    );
    expect(go).toMatch(/function mimeFor/u);
    expect(go).toMatch(/\.mjs/u);
  });
});
