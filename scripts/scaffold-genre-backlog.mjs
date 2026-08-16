#!/usr/bin/env node
/**
 * Scaffold all genre-coverage backlog games under ~/dev/sampot/<id>.
 * Each game is playable HTML/CSS/JS with copied Kenney/Blippy assets + vitest.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES, MUSIC, SFX, GA } from "./genre-backlog-manifest.mjs";
import { buildGameJs, buildAppJs, buildHtml, buildCss, buildTest } from "./genre-game-templates.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.SAMPOT_GAMES_ROOT || join(dirname(ROOT), "");
const GA_ROOT = join(ROOT, "game-assets");

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function tryCopy(src, dest) {
  if (!existsSync(src)) {
    console.warn("missing asset", src);
    return false;
  }
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  return true;
}

function copyAssets(g, destRoot) {
  const audioDir = join(destRoot, "assets/audio");
  const imgDir = join(destRoot, "assets/images");
  const licDir = join(destRoot, "assets/licenses");
  ensureDir(audioDir);
  ensureDir(imgDir);
  ensureDir(licDir);

  tryCopy(join(GA_ROOT, MUSIC[g.music] || MUSIC.dew), join(audioDir, "music.ogg"));
  tryCopy(join(GA_ROOT, SFX.click), join(audioDir, "click.ogg"));
  tryCopy(join(GA_ROOT, SFX.ok), join(audioDir, "ok.ogg"));
  tryCopy(join(GA_ROOT, SFX.hit), join(audioDir, "hit.ogg"));
  tryCopy(join(GA_ROOT, SFX.soft), join(audioDir, "soft.ogg"));
  tryCopy(join(GA_ROOT, SFX.coin), join(audioDir, "coin.ogg"));

  const artMap = {
    toon: [
      ["art/toon-characters/Male person/PNG/Poses/character_malePerson_idle.png", "hero.png"],
      ["art/toon-characters/Male person/PNG/Poses/character_malePerson_attack0.png", "hero-attack.png"],
      ["art/toon-characters/Female person/PNG/Poses/character_femalePerson_idle.png", "rival.png"],
      ["art/toon-characters/Male adventurer/PNG/Poses/character_maleAdventurer_idle.png", "npc.png"],
    ],
    sports: [
      ["art/sports-pack/PNG/Blue/characterBlue (1).png", "hero.png"],
      ["art/sports-pack/PNG/Green/characterGreen (1).png", "rival.png"],
      ["art/sports-pack/PNG/Blue/characterBlue (5).png", "ball.png"],
    ],
    platform: [
      ["art/pixel-platformer/Tiles/tile_0001.png", "tile.png"],
      ["art/pixel-platformer/Tiles/tile_0021.png", "ground.png"],
      ["art/pixel-platformer/Tiles/tile_0040.png", "hero.png"],
      ["art/pixel-platformer/Tiles/tile_0121.png", "enemy.png"],
    ],
    shmup: [
      ["art/rts/pixel-shmup/Ships/ship_0000.png", "hero.png"],
      ["art/rts/pixel-shmup/Ships/ship_0015.png", "rival.png"],
      ["art/rts/pixel-shmup/Ships/ship_0004.png", "enemy.png"],
    ],
    cards: [
      ["art/playing-cards-pack/PNG/Cards (medium)/card_back.png", "card-back.png"],
      ["art/playing-cards-pack/PNG/Cards (medium)/card_hearts_A.png", "hero.png"],
      ["art/playing-cards-pack/PNG/Cards (medium)/card_spades_K.png", "rival.png"],
    ],
    board: [
      ["art/boardgame-pack/PNG/Dice/dieWhite_border5.png", "die.png"],
      ["art/game-icons/PNG/Black/2x/trophy.png", "hero.png"],
      ["art/game-icons/PNG/Black/2x/gear.png", "rival.png"],
    ],
    rts: [
      ["art/rts/tower-defense-kit/Previews/detail-crystal-large.png", "tower.png"],
      ["art/rts/top-down-tanks/PNG/Tanks/tankBlue.png", "hero.png"],
      ["art/rts/top-down-tanks/PNG/Tanks/tankRed.png", "rival.png"],
    ],
    food: [
      ["art/food-kit/Previews/chinese.png", "hero.png"],
      ["art/food-kit/Previews/waffle.png", "rival.png"],
      ["art/food-kit/Previews/cake.png", "food3.png"],
    ],
    fish: [
      ["art/fish-pack/PNG/Default/fish_blue.png", "hero.png"],
      ["art/fish-pack/PNG/Default/fish_green.png", "rival.png"],
      ["art/fish-pack/PNG/Default/fish_pink.png", "fish3.png"],
    ],
    physics: [
      ["art/physics-assets/PNG/Wood elements/elementWood000.png", "hero.png"],
      ["art/physics-assets/PNG/Metal elements/elementMetal000.png", "rival.png"],
    ],
    ui: [
      ["art/game-icons/PNG/Black/2x/trophy.png", "hero.png"],
      ["art/game-icons/PNG/Black/2x/gear.png", "rival.png"],
      ["art/ui-pack/PNG/Blue/Default/button_rectangle_depth_flat.png", "btn.png"],
    ],
  };

  // fallbacks for missing pose names
  const fallbacks = {
    "art/toon-characters/Male person/PNG/Poses/character_malePerson_idle.png":
      "art/toon-characters/Male person/PNG/Poses/character_malePerson_interact.png",
    "art/toon-characters/Male person/PNG/Poses/character_malePerson_attack.png":
      "art/toon-characters/Male person/PNG/Poses/character_malePerson_swing.png",
    "art/toon-characters/Female person/PNG/Poses/character_femalePerson_idle.png":
      "art/toon-characters/Female person/PNG/Poses/character_femalePerson_interact.png",
    "art/toon-characters/Male adventurer/PNG/Poses/character_maleAdventurer_idle.png":
      "art/toon-characters/Male adventurer/PNG/Poses/character_maleAdventurer_interact.png",
    "art/food-kit/Previews/cornDog.png": "art/food-kit/Previews/corn-dog.png",
    "art/fish-pack/PNG/Default/fish_blue.png": null,
  };

  const pairs = artMap[g.art] || artMap.ui;
  for (const [rel, name] of pairs) {
    let src = join(GA_ROOT, rel);
    if (!existsSync(src) && fallbacks[rel]) {
      src = join(GA_ROOT, fallbacks[rel]);
    }
    if (!existsSync(src)) {
      // pick any png from a known dir
      continue;
    }
    tryCopy(src, join(imgDir, name));
  }

  // Always ensure at least hero.png exists via sports or toon walk
  if (!existsSync(join(imgDir, "hero.png"))) {
    const candidates = [
      "art/toon-characters/Male person/PNG/Poses/character_malePerson_walk0.png",
      "art/sports-pack/PNG/Blue/characterBlue (1).png",
      "art/rts/pixel-shmup/Ships/ship_0000.png",
      "art/game-icons/PNG/Black/2x/trophy.png",
    ];
    for (const c of candidates) {
      if (tryCopy(join(GA_ROOT, c), join(imgDir, "hero.png"))) break;
    }
  }

  tryCopy(join(GA_ROOT, "art/toon-characters/License.txt"), join(licDir, "kenney-toon.txt"));
  tryCopy(join(GA_ROOT, "music/blippy-bits/License.txt"), join(licDir, "blippy-bits.txt"));
}

function writeAttribution(g, destRoot) {
  const text = `# Attribution（${g.id}）

本遊戲使用以下資源（即使 CC0 仍署名）：

## 美術
- Kenney.nl packs（CC0）— 見 \`assets/licenses/\` 與 [game-assets/ATTRIBUTION.md](https://github.com/sampot/playgrounds/blob/main/game-assets/ATTRIBUTION.md)
- 角色／圖示依類型取自 Toon Characters、Sports Pack、Pixel Platformer、Pixel Shmup、Playing Cards、Boardgame Pack、Food Kit、Fish Pack 等

## 音效
- Kenney UI Audio、Impact Sounds、Casino Audio、RPG Audio（CC0）

## 音樂
- Dylann Taylor — BLIPPY BITS（Loop）https://dylanntaylor.itch.io/blippy-bits
- HydroGene — High Quality 16-bit RPG Music（部分策略／RPG 曲）https://hydrogene.itch.io/high-quality-16bit-music

## 類型
- ${g.genre}：${g.blurb}
`;
  writeFileSync(join(destRoot, "ATTRIBUTION.md"), text, "utf8");
}

function writeCommon(g, destRoot) {
  writeFileSync(
    join(destRoot, "audio.js"),
    `export class GameAudio {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.music = new Audio("./assets/audio/music.ogg");
    this.music.loop = true;
    this.music.volume = 0.28;
    this.fx = {
      click: Object.assign(new Audio("./assets/audio/click.ogg"), { volume: 0.4 }),
      ok: Object.assign(new Audio("./assets/audio/ok.ogg"), { volume: 0.45 }),
      hit: Object.assign(new Audio("./assets/audio/hit.ogg"), { volume: 0.5 }),
      soft: Object.assign(new Audio("./assets/audio/soft.ogg"), { volume: 0.4 }),
      coin: Object.assign(new Audio("./assets/audio/coin.ogg"), { volume: 0.45 }),
    };
  }
  async start() {
    this.started = true;
    if (!this.enabled) return;
    try { await this.music.play(); } catch {}
  }
  setEnabled(on) {
    this.enabled = on;
    if (!on) this.music.pause();
    else if (this.started) void this.start();
  }
  play(name) {
    if (!this.enabled || !this.fx[name]) return;
    const a = this.fx[name];
    a.currentTime = 0;
    void a.play().catch(() => {});
  }
}
`,
    "utf8",
  );

  writeFileSync(
    join(destRoot, "persist.js"),
    `const KEY = "/api/kv/${g.id}:progress";

export async function loadProgress(fetcher = fetch) {
  try {
    const res = await fetcher(KEY);
    if (!res.ok) return {};
    const text = await res.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function saveProgress(data, fetcher = fetch) {
  try {
    await fetcher(KEY, { method: "PUT", body: JSON.stringify(data) });
  } catch {}
  return data;
}
`,
    "utf8",
  );

  writeFileSync(
    join(destRoot, "functions.js"),
    `export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "${g.id}",
      path: new URL(request.url).pathname,
    });
  },
};
`,
    "utf8",
  );

  writeFileSync(
    join(destRoot, "vitest.config.js"),
    `module.exports = { test: { include: ["*.test.js"] } };
`,
    "utf8",
  );

  writeFileSync(
    join(destRoot, "LICENSE"),
    `MIT License

Copyright (c) 2026 sampot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
    "utf8",
  );

  writeFileSync(
    join(destRoot, "README.md"),
    `# ${g.title} (\`${g.id}\`)

${g.blurb}

類型：**${g.genre}** · 系列建議：${g.series}

## 遊玩

純 HTML／CSS／JavaScript（無 build）。本機開 \`index.html\` 或經 Playgrounds／go 安裝。

## 開發

\`\`\`bash
npx vitest run
\`\`\`

## 署名

見 [ATTRIBUTION.md](./ATTRIBUTION.md)。
`,
    "utf8",
  );
}

async function main() {
  console.log("OUT", OUT);
  let n = 0;
  for (const g of GAMES) {
    const dest = join(OUT, g.id);
    ensureDir(dest);
    copyAssets(g, dest);
    writeAttribution(g, dest);
    writeCommon(g, dest);
    writeFileSync(join(dest, "game.js"), buildGameJs(g), "utf8");
    writeFileSync(join(dest, "app.js"), buildAppJs(g), "utf8");
    writeFileSync(join(dest, "index.html"), buildHtml(g), "utf8");
    writeFileSync(join(dest, "styles.css"), buildCss(g), "utf8");
    writeFileSync(join(dest, "game.test.js"), buildTest(g), "utf8");
    n++;
    console.log("scaffolded", g.id);
  }
  console.log("done", n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
