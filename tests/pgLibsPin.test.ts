/**
 * PG-LIBS-SPEC: pin.json ↔ sdk.js LIB_PIN stay aligned; every pin has
 * binary + LICENSE on disk. SW must not list /playgrounds/libs/ in precache.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const pinPath = join(root, "public/playgrounds/libs/pin.json");
const sdkPath = join(root, "public/playgrounds/sdk.js");
const swPath = join(root, "public/sw.js");
const libsDir = join(root, "public/playgrounds/libs");

type PinEntry = {
  id: string;
  version: string;
  file: string;
  kind?: string;
  globalName?: string;
  licenseFile?: string;
};

function readPin(): Record<string, PinEntry> {
  return JSON.parse(readFileSync(pinPath, "utf8")) as Record<string, PinEntry>;
}

describe("PG.libs pin table", () => {
  it("every pin entry has binary + LICENSE on disk (CI gate)", () => {
    const pin = readPin();
    const ids = Object.keys(pin);
    expect(ids.length).toBe(9);
    expect(ids.sort()).toEqual([
      "howler",
      "matter",
      "nipple",
      "phaser",
      "pixi",
      "planck",
      "seedrandom",
      "three",
      "tone",
    ]);
    for (const id of ids) {
      const entry = pin[id];
      expect(entry.id, id).toBe(id);
      expect(entry.version, id).toMatch(/^\d+\.\d+/u);
      const fileAbs = join(libsDir, entry.file);
      expect(existsSync(fileAbs), `missing ${entry.file}`).toBe(true);
      const licName = entry.licenseFile ?? `LICENSE-${id}.txt`;
      const licAbs = join(libsDir, licName);
      expect(existsSync(licAbs), `missing ${licName}`).toBe(true);
      const licText = readFileSync(licAbs, "utf8");
      expect(
        /MIT License|Permission is hereby granted/i.test(licText),
        `${licName} should look like MIT`,
      ).toBe(true);
    }
  });

  it("sdk.js embeds the same id/version/file for every pin.json entry", () => {
    const pin = readPin();
    const sdk = readFileSync(sdkPath, "utf8");
    expect(sdk).toMatch(/\blibs:\s*makeLibs\s*\(\s*\)/u);
    for (const [id, entry] of Object.entries(pin)) {
      expect(sdk, id).toContain(`id: "${entry.id}"`);
      expect(sdk, id).toContain(`version: "${entry.version}"`);
      expect(sdk, id).toContain(`file: "${entry.file}"`);
      if ((entry as { format?: string }).format === "esm") {
        expect(sdk, id).toContain('format: "esm"');
      }
    }
  });
});

describe("PG.libs no SW precache (G6)", () => {
  it("public/sw.js excludes libs from offline cache (G6), extractShell does not list them", () => {
    const sw = readFileSync(swPath, "utf8");
    expect(sw).toMatch(/isPlaygroundsLibsPath/u);
    expect(sw).toMatch(/PG-LIBS-SPEC G6/u);
    expect(sw).toMatch(/function extractShellAssetUrls/u);
    // Precache extractor must not hardcode lib URLs.
    const extractFn = sw.match(
      /function extractShellAssetUrls\([\s\S]*?\n\}/u,
    )?.[0];
    expect(extractFn).toBeTruthy();
    expect(extractFn).not.toMatch(/playgrounds\/libs/u);
  });
});
